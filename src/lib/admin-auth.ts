import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const FACEBOOK_OAUTH_STATE_COOKIE = "fb_oauth_state";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  email: string;
  exp: number;
  iat: number;
};

function getAdminConfig() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!email || !password || !sessionSecret) {
    throw new Error("Missing admin authentication environment variables");
  }

  return { email, password, sessionSecret };
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

export function validateAdminCredentials(email: string, password: string) {
  const config = getAdminConfig();

  return (
    safeEqual(email.trim().toLowerCase(), config.email.trim().toLowerCase()) &&
    safeEqual(password, config.password)
  );
}

export function createAdminSessionToken(email: string) {
  const { sessionSecret } = getAdminConfig();
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

  const { sessionSecret } = getAdminConfig();
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
