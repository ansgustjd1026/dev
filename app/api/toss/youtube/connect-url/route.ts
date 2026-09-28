import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrigin } from "@/lib/auth/public-origin";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl", "https://www.googleapis.com/auth/youtube.readonly"];

export async function GET(request: Request) {
  const user = await getAuthenticatedApiUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth 설정이 비어 있습니다." }, { status: 503 });

  const state = crypto.randomUUID();
  const { error } = await createAdminClient().from("toss_youtube_oauth_states").insert({ state, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (error) return NextResponse.json({ error: "YouTube 연결 상태를 저장하지 못했습니다. Supabase SQL을 확인해주세요." }, { status: 500 });

  const redirectUri = new URL("/api/toss/youtube/callback", getPublicOrigin(request)).toString();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  return NextResponse.json({ url: authUrl.toString() });
}
