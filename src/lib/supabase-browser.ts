import { createClient } from "@supabase/supabase-js";

function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables");
  }

  return { url, publishableKey };
}

export function getSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseBrowserConfig();

  return createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
