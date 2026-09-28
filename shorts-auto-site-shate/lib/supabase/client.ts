import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface Window {
    __shatePublicConfig?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

export function createClient() {
  const runtimeConfig =
    typeof window === "undefined" ? undefined : window.__shatePublicConfig;
  const supabaseUrl =
    runtimeConfig?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    runtimeConfig?.supabaseAnonKey ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "SUPABASE_CONFIGURATION_MISSING: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
