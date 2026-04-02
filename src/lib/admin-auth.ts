import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSupabaseServerClient } from "../../lib/supabase";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const FACEBOOK_OAUTH_STATE_COOKIE = "fb_oauth_state";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  email: string;
  exp: number;
  iat: number;
};

function getAdminSessionConfig() {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!sessionSecret) {
    throw new Error("Missing admin session environment variables");
  }

  return { sessionSecret };
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export async function verifyAdminAccessToken(accessToken: string) {
  const token = accessToken.trim();

  if (!token) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    if (error.message === "fetch failed" || error.name === "AuthRetryableFetchError") {
      throw new Error("Unable to reach Supabase Auth");
    }

    return null;
  }

  if (!data.user?.email) {
    return null;
  }

  return {
    email: data.user.email.trim().toLowerCase(),
    userId: data.user.id,
  };
}

export function createAdminSessionToken(email: string) {
  const { sessionSecret } = getAdminSessionConfig();
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload, sessionSecret);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  const { sessionSecret } = getAdminSessionConfig();
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload, sessionSecret);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

    if (!payload.email || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function generateFacebookOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function isValidFacebookOAuthState(
  actual: string | undefined | null,
  expected: string | undefined | null
) {
  if (!actual || !expected) {
    return false;
  }

  return safeEqual(actual, expected);
}
