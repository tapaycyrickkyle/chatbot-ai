import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  verifyBusinessOwnerAccessToken,
} from "@/lib/admin-auth";
import { getOrdersForClient } from "@/lib/database";

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
    const orders = await getOrdersForClient(owner.clientId);

    return NextResponse.json({
      client: {
        id: owner.clientId,
        client_name: owner.clientName,
        page_id: owner.pageId,
      },
      orders,
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
