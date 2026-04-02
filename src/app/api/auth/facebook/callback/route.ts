import { NextRequest, NextResponse } from "next/server";
import {
  FACEBOOK_OAUTH_STATE_COOKIE,
  isValidFacebookOAuthState,
} from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard?error=no_code", req.url));
  }

  if (!isValidFacebookOAuthState(state, storedState)) {
    return NextResponse.redirect(new URL("/dashboard?error=invalid_state", req.url));
  }

  const tokenResponse = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&redirect_uri=${process.env.FACEBOOK_REDIRECT_URI}&code=${code}`
  );
  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    console.error(tokenData);
    return NextResponse.redirect(
      new URL("/dashboard?error=token_failed", req.url)
    );
  }

  const shortLivedUserToken = tokenData.access_token;

  const longLivedTokenResponse = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${shortLivedUserToken}`
  );
  const longLivedData = await longLivedTokenResponse.json();
  const longLivedUserToken = longLivedData.access_token;

  const pagesResponse = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?access_token=${longLivedUserToken}`
  );
  const pagesData = await pagesResponse.json();
  const safePages = Array.isArray(pagesData.data)
    ? pagesData.data.map((page: { id?: string; name?: string }) => ({
        id: page.id ?? "",
        name: page.name ?? "",
      }))
    : [];

  const response = NextResponse.redirect(
    new URL("/dashboard?fb_connected=true", req.url)
  );

  response.cookies.set("fb_user_token", longLivedUserToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 60,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.set("fb_pages", encodeURIComponent(JSON.stringify(safePages)), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
