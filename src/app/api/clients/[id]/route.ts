import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import { getClientById, updateClientSettings } from "@/lib/database";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function validateClientSettingsPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body");
  }

  const { bot_type, business_info } = payload as Record<string, unknown>;
  const updates: Partial<{
    bot_type: "keyword" | "ai";
    business_info: string;
  }> = {};

  if (bot_type !== undefined) {
    if (bot_type !== "keyword" && bot_type !== "ai") {
      throw new Error("Invalid bot_type");
    }

    updates.bot_type = bot_type;
  }

  if (business_info !== undefined) {
    if (typeof business_info !== "string") {
      throw new Error("Invalid business_info");
    }

    if (business_info.length > 20000) {
      throw new Error("Business information is too long");
    }

    updates.business_info = business_info.trim();
  }

  return updates;
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

    return NextResponse.json({
      id: client.id,
      client_name: client.client_name,
      page_id: client.page_id,
      bot_type: client.bot_type,
      business_info: client.business_info,
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

export async function PUT(
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

    const updates = validateClientSettingsPayload(await req.json());

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No settings provided" }, { status: 400 });
    }

    await updateClientSettings(clientId, updates);
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
