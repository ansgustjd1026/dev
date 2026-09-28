import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { getPublicOrigin } from "@/lib/auth/public-origin";

const STATE_COOKIE = "youtube_oauth_state";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export async function GET(request: Request): Promise<Response> {
  const origin = getPublicOrigin(request);
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(
      new URL("/profile?youtube=missing-config", origin)
    );
  }

  const state = `${user.id}:${crypto.randomUUID()}`;
  const redirectUri = new URL("/api/youtube/callback", origin).toString();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function DELETE(): Promise<Response> {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { error } = await createAdminClient()
      .from("youtube_connections")
      .delete()
      .eq("user_id", user.id);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error: unknown) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "YouTube 연동 해제에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}
