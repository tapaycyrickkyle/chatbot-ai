import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  validateAdminCredentials,
} from "@/lib/admin-auth";
import { assertSameOrigin } from "@/lib/api-security";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);

    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email.trim() || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const adminUser = await validateAdminCredentials(email, password);

    if (!adminUser) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(adminUser.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" || message === "Missing host header"
        ? 403
        : message === "Missing admin session environment variables" ||
            message === "Missing Supabase environment variables" ||
            message === "Unable to reach Supabase Auth"
          ? 500
          : 500;

    return NextResponse.json(
      { error: message || (status === 500 ? "Internal server error" : message) },
      { status }
    );
  }
}
