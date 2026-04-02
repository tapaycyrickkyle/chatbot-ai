import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  verifyAdminAccessToken,
} from "@/lib/admin-auth";
import { assertSameOrigin } from "@/lib/api-security";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);

    const body = await req.json();
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";

    if (!accessToken.trim()) {
      return NextResponse.json({ error: "Missing access token" }, { status: 400 });
    }

    const adminUser = await verifyAdminAccessToken(accessToken);

    if (!adminUser) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" || message === "Missing host header"
        ? 403
        : 500;

    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}
