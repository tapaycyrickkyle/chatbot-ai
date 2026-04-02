import { NextRequest, NextResponse } from "next/server";
import {
  FACEBOOK_OAUTH_STATE_COOKIE,
  isValidFacebookOAuthState,
} from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  };

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedState = req.cookies.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;

    if (!code) {
      const response = NextResponse.redirect(
        new URL("/dashboard?error=no_code", req.url)
      );
      clearStateCookie(response);
      return response;
    }

    if (!isValidFacebookOAuthState(state, storedState)) {
      const response = NextResponse.redirect(
        new URL("/dashboard?error=invalid_state", req.url)
      );
      clearStateCookie(response);
      return response;
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

    if (!appId || !appSecret || !redirectUri) {
      throw new Error("Missing Facebook environment variables");
    }

    const shortLivedTokenUrl = new URL(
      "https://graph.facebook.com/v20.0/oauth/access_token"
    );
    shortLivedTokenUrl.search = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }).toString();

    const tokenResponse = await fetch(shortLivedTokenUrl.toString());
    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: unknown;
    };

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Facebook short-lived token exchange failed", tokenData);
      const response = NextResponse.redirect(
        new URL("/dashboard?error=token_failed", req.url)
      );
      clearStateCookie(response);
      return response;
    }

    const longLivedTokenUrl = new URL(
      "https://graph.facebook.com/v20.0/oauth/access_token"
    );
    longLivedTokenUrl.search = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: tokenData.access_token,
    }).toString();

    const longLivedTokenResponse = await fetch(longLivedTokenUrl.toString());
    const longLivedData = (await longLivedTokenResponse.json()) as {
      access_token?: string;
      error?: unknown;
    };

    if (!longLivedTokenResponse.ok || !longLivedData.access_token) {
      console.error("Facebook long-lived token exchange failed", longLivedData);
      const response = NextResponse.redirect(
        new URL("/dashboard?error=long_lived_token_failed", req.url)
      );
      clearStateCookie(response);
      return response;
    }

    const pagesUrl = new URL("https://graph.facebook.com/v20.0/me/accounts");
    pagesUrl.search = new URLSearchParams({
      access_token: longLivedData.access_token,
    }).toString();

    const pagesResponse = await fetch(pagesUrl.toString());
    const pagesData = (await pagesResponse.json()) as {
      data?: Array<{ id?: string; name?: string }>;
      error?: unknown;
    };

    if (!pagesResponse.ok) {
      console.error("Facebook pages fetch failed", pagesData);
      const response = NextResponse.redirect(
        new URL("/dashboard?error=pages_failed", req.url)
      );
      clearStateCookie(response);
      return response;
    }

    const safePages = Array.isArray(pagesData.data)
      ? pagesData.data.map((page) => ({
          id: page.id ?? "",
          name: page.name ?? "",
        }))
      : [];

    const response = NextResponse.redirect(
      new URL("/dashboard?fb_connected=true", req.url)
    );

    response.cookies.set("fb_user_token", longLivedData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 60,
      path: "/",
      sameSite: "lax",
    });
    response.cookies.set(
      "fb_pages",
      encodeURIComponent(JSON.stringify(safePages)),
      {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24,
        path: "/",
        sameSite: "lax",
      }
    );
    clearStateCookie(response);

    return response;
  } catch (error) {
    console.error("Facebook callback route failed", error);
    const response = NextResponse.redirect(
      new URL("/dashboard?error=callback_failed", req.url)
    );
    clearStateCookie(response);
    return response;
  }
}
