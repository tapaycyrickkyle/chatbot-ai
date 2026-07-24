import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import {
  getAiConversationsForClient,
  getClientById,
  pauseAiConversation,
  resumeAllAiConversationsForClient,
  resumeAiConversation,
} from "@/lib/database";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;
    const clientId = sanitizeIdentifier(id, "client ID");
    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const conversations = await getAiConversationsForClient(clientId);

    return NextResponse.json({
      client: {
        id: client.id,
        client_name: client.client_name,
        page_id: client.page_id,
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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const { id } = await context.params;
    const clientId = sanitizeIdentifier(id, "client ID");
    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as
      | { recipientId?: unknown; action?: unknown }
      | null;
    const recipientId =
      typeof body?.recipientId === "string"
        ? sanitizeIdentifier(body.recipientId, "recipient ID")
        : "";
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "resume_all") {
      await resumeAllAiConversationsForClient(clientId);
      return NextResponse.json({ success: true });
    }

    if (!recipientId) {
      return NextResponse.json({ error: "Missing recipient ID" }, { status: 400 });
    }

    if (action === "pause") {
      await pauseAiConversation({
        clientId,
        pageId: client.page_id,
        recipientId,
        pausedBy: "admin",
      });
    } else if (action === "resume") {
      await resumeAiConversation(clientId, recipientId);
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
