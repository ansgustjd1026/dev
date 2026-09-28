import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
type ChannelsResponse = { items?: Array<{ id?: string; snippet?: { title?: string } }>; error?: { message?: string } };

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const input = data as { error_description?: unknown; error?: { message?: unknown } } | null;
    const message = typeof input?.error_description === "string" ? input.error_description : typeof input?.error?.message === "string" ? input.error.message : "Google API request failed.";
    throw new Error(message);
  }
  return data as T;
}

export async function connectYouTubeAccount({ userId, code, redirectUri }: { userId: string; code: string; redirectUri: string }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth 설정이 비어 있습니다.");

  const token = await fetchJson<TokenResponse>(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, grant_type: "authorization_code" }),
  });
  if (!token.access_token) throw new Error("Google이 access token을 반환하지 않았습니다.");

  const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelsUrl.searchParams.set("part", "snippet");
  channelsUrl.searchParams.set("mine", "true");
  const channels = await fetchJson<ChannelsResponse>(channelsUrl.toString(), { headers: { Authorization: `Bearer ${token.access_token}` } });
  const channel = channels.items?.[0];
  if (!channel?.id) throw new Error("연결할 YouTube 채널을 찾지 못했습니다.");

  const admin = createAdminClient();
  const { data: existing } = await admin.from("youtube_connections").select("refresh_token").eq("user_id", userId).maybeSingle<{ refresh_token: string | null }>();
  const refreshToken = token.refresh_token ?? existing?.refresh_token ?? "";
  if (!refreshToken) throw new Error("Google refresh token을 받지 못했습니다. 다시 연결해주세요.");

  const { error } = await admin.from("youtube_connections").upsert({
    user_id: userId,
    channel_id: channel.id,
    channel_title: channel.snippet?.title ?? null,
    access_token: token.access_token,
    refresh_token: refreshToken,
    token_expires_at: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return { channelId: channel.id, channelTitle: channel.snippet?.title ?? null };
}
