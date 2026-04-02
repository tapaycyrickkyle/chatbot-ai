import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/database";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const session = verifyAdminSessionToken(
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await getClients();
    const safeClients = clients.map((client) => ({
      id: client.id,
      client_name: client.client_name,
      page_id: client.page_id,
      created_at: client.created_at,
    }));

    return NextResponse.json({ success: true, clients: safeClients });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
