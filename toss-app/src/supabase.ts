import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TossAuth } from "@apps-in-toss/web-framework";

type PublicConfig = { supabaseUrl: string; supabaseAnonKey: string };
let clientPromise: Promise<SupabaseClient> | null = null;

const DEFAULT_WEB_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://shate-37cj.onrender.com";

export const SHATE_WEB_URL = (
  import.meta.env.VITE_SHATE_WEB_URL || DEFAULT_WEB_URL
).replace(/\/$/, "");

export function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = fetch(`${SHATE_WEB_URL}/api/app-config`, {
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      const data = (await response.json()) as Partial<PublicConfig> & { error?: string };
      if (!response.ok || !data.supabaseUrl || !data.supabaseAnonKey) {
        throw new Error(data.error || "앱 인증 설정을 불러오지 못했습니다.");
      }

      return createClient(data.supabaseUrl, data.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    });
  }

  return clientPromise;
}

export async function signInWithToss() {
  const { authorizationCode, referrer } = await TossAuth.login();
  const response = await fetch(`${SHATE_WEB_URL}/api/toss/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ authorizationCode, referrer }),
  });
  const data = (await response.json().catch(() => null)) as { tokenHash?: string; error?: string } | null;
  if (!response.ok || !data?.tokenHash) throw new Error(data?.error || "토스 로그인을 완료하지 못했습니다.");

  const supabase = await getSupabaseClient();
  const { data: verified, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.tokenHash,
  });
  if (error || !verified.user) throw new Error("Shate 앱 세션을 만들지 못했습니다.");
  return verified.user;
}

export async function authorizedApiRequest(path: string, init: RequestInit = {}) {
  const supabase = await getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 만료되었습니다.");

  return fetch(`${SHATE_WEB_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}
