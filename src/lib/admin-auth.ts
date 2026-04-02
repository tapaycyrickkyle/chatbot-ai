import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { getSupabaseServerClient } from "../../lib/supabase";

export const ADMIN_ACCESS_TOKEN_COOKIE = "sb_access_token";
export const FACEBOOK_OAUTH_STATE_COOKIE = "fb_oauth_state";

function getConfiguredAdminEmails() {
  return (process.env.SUPABASE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function hasConfiguredAdminEmails() {
  return getConfiguredAdminEmails().length > 0;
}

function isAllowedAdminEmail(email: string) {
  const configuredEmails = getConfiguredAdminEmails();

  if (configuredEmails.length === 0) {
    return false;
  }

  return configuredEmails.includes(email.trim().toLowerCase());
}

export async function verifyAdminAccessToken(accessToken: string | undefined | null) {
  const token = accessToken?.trim();

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

  const email = data.user?.email?.trim().toLowerCase();

  if (!email || !isAllowedAdminEmail(email)) {
    return null;
  }

  return {
    email,
    userId: data.user.id,
  };
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

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
