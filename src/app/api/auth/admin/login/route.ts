import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  hasConfiguredAdminEmails,
  verifyAdminAccessToken,
} from "@/lib/admin-auth";
import { assertSameOrigin } from "@/lib/api-security";
import { getSupabaseAuthClient } from "@/lib/supabase";

type SignInPayload = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);

    if (!hasConfiguredAdminEmails()) {
      return NextResponse.json(
        { error: "Missing admin allowlist configuration" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as SignInPayload;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const supabase = getSupabaseAuthClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    const accessToken = data.session?.access_token;

    if (signInError || !accessToken) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const admin = await verifyAdminAccessToken(accessToken);

    if (!admin) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      role: "admin",
      redirectTo: "/dashboard",
    });
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
