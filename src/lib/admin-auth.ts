import "server-only";

import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "../../lib/supabase";

export const ADMIN_ACCESS_TOKEN_COOKIE = "sb_access_token";
export const FACEBOOK_OAUTH_STATE_COOKIE = "fb_oauth_state";

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

  if (!data.user?.email) {
    return null;
  }

  return {
    email: data.user.email.trim().toLowerCase(),
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

  return actual === expected;
}
