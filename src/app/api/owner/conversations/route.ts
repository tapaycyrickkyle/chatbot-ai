import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  verifyBusinessOwnerAccessToken,
} from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import {
  getAiConversationsForClient,
  pauseAiConversation,
  resumeAiConversation,
  updateClientSettings,
} from "@/lib/database";

const MIN_MANUAL_AI_PAUSE_MINUTES = 1;
const MAX_MANUAL_AI_PAUSE_MINUTES = 1440;

function parseManualAiPauseMinutes(value: unknown) {
  const minutes = typeof value === "number" ? value : Number(value);

  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_MANUAL_AI_PAUSE_MINUTES ||
    minutes > MAX_MANUAL_AI_PAUSE_MINUTES
  ) {
    throw new Error("Invalid stop AI duration");
  }

  return minutes;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const owner = await verifyBusinessOwnerAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!owner) {
    return unauthorizedResponse();
  }

  try {
    const conversations = await getAiConversationsForClient(owner.clientId);

    return NextResponse.json({
      client: {
        id: owner.clientId,
        client_name: owner.clientName,
        page_id: owner.pageId,
        manual_ai_pause_minutes: owner.manualAiPauseMinutes,
      },
      conversations,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "Internal server error" ? 500 : 400;

    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const owner = await verifyBusinessOwnerAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!owner) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const body = (await req.json().catch(() => null)) as
      | { recipientId?: unknown; action?: unknown; manualAiPauseMinutes?: unknown }
      | null;
    const recipientId =
      typeof body?.recipientId === "string"
        ? sanitizeIdentifier(body.recipientId, "recipient ID")
        : "";
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "set_pause_duration") {
      const manualAiPauseMinutes = parseManualAiPauseMinutes(body?.manualAiPauseMinutes);

      await updateClientSettings(owner.clientId, {
        manual_ai_pause_minutes: manualAiPauseMinutes,
      });

      return NextResponse.json({ success: true, manualAiPauseMinutes });
    }

    if (!recipientId) {
      return NextResponse.json({ error: "Missing recipient ID" }, { status: 400 });
    }

    if (action === "pause") {
      await pauseAiConversation({
        clientId: owner.clientId,
        pageId: owner.pageId,
        recipientId,
        pausedBy: "owner",
      });
    } else if (action === "resume") {
      await resumeAiConversation(owner.clientId, recipientId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" ||
      message === "Missing host header"
        ? 403
        : message === "Internal server error"
          ? 500
          : 400;

    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}
