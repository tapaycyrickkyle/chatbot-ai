import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  FACEBOOK_OAUTH_STATE_COOKIE,
  isValidFacebookOAuthState,
  verifyAdminAccessToken,
} from "@/lib/admin-auth";

function clearTransientCookies(response: NextResponse) {
  response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

async function exchangeFacebookToken(
  params: Record<string, string>
) {
  const response = await fetch("https://graph.facebook.com/v20.0/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });

  const data = (await response.json()) as {
    access_token?: string;
    error?: unknown;
  };

  return { response, data };
}

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAdminAccessToken(
      req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
    );

    if (!session) {
      const response = NextResponse.redirect(new URL("/sign-in", req.url));
      clearTransientCookies(response);
      return response;
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedState = req.cookies.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;

    if (!code) {
      const response = NextResponse.redirect(
        new URL("/dashboard?error=no_code", req.url)
      );
      clearTransientCookies(response);
      return response;
    }

    if (!isValidFacebookOAuthState(state, storedState)) {
      const response = NextResponse.redirect(
        new URL("/dashboard?error=invalid_state", req.url)
      );
      clearTransientCookies(response);
      return response;
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

    if (!appId || !appSecret || !redirectUri) {
      throw new Error("Missing Facebook environment variables");
    }

    const shortLived = await exchangeFacebookToken({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    if (!shortLived.response.ok || !shortLived.data.access_token) {
      console.error("Facebook short-lived token exchange failed", shortLived.data);
      const response = NextResponse.redirect(
        new URL("/dashboard?error=token_failed", req.url)
      );
      clearTransientCookies(response);
      return response;
    }

    const longLived = await exchangeFacebookToken({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.data.access_token,
    });

    if (!longLived.response.ok || !longLived.data.access_token) {
      console.error("Facebook long-lived token exchange failed", longLived.data);
      const response = NextResponse.redirect(
        new URL("/dashboard?error=long_lived_token_failed", req.url)
      );
      clearTransientCookies(response);
      return response;
    }

    const pagesResponse = await fetch("https://graph.facebook.com/v20.0/me/accounts", {
      headers: {
        Authorization: `Bearer ${longLived.data.access_token}`,
      },
    });
    const pagesData = (await pagesResponse.json()) as {
      data?: Array<{ id?: string; name?: string }>;
      error?: unknown;
    };

    if (!pagesResponse.ok) {
      console.error("Facebook pages fetch failed", pagesData);
      const response = NextResponse.redirect(
        new URL("/dashboard?error=pages_failed", req.url)
      );
      clearTransientCookies(response);
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

    response.cookies.set("fb_user_token", longLived.data.access_token, {
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
    response.cookies.set("fb_connected", "true", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 5,
      path: "/",
      sameSite: "lax",
    });
    clearTransientCookies(response);

    return response;
  } catch (error) {
    console.error("Facebook callback route failed", error);
    const response = NextResponse.redirect(
      new URL("/dashboard?error=callback_failed", req.url)
    );
    clearTransientCookies(response);
    return response;
  }
}
