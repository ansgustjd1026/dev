import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerSupabaseConfig } from "@/lib/supabase/config";

export async function getAuthenticatedApiUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user) return user;

  const authorization = (await headers()).get("authorization") ?? "";
  return getUserFromAuthorizationHeader(authorization);
}

export async function getAuthenticatedRequestUser(request: Request) {
  return getUserFromAuthorizationHeader(request.headers.get("authorization") ?? "");
}

async function getUserFromAuthorizationHeader(authorization: string) {
  if (!authorization.startsWith("Bearer ")) return null;

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) return null;

  const { url, anonKey } = getServerSupabaseConfig();
  const supabase = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : user;
}
