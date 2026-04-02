import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  FACEBOOK_OAUTH_STATE_COOKIE,
  generateFacebookOAuthState,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const session = verifyAdminSessionToken(
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const state = generateFacebookOAuthState();
  const facebookLoginUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${process.env.FACEBOOK_REDIRECT_URI}&scope=pages_messaging,pages_read_engagement,pages_manage_metadata,pages_show_list&response_type=code&state=${state}`;
  const response = NextResponse.redirect(facebookLoginUrl);

  response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}
