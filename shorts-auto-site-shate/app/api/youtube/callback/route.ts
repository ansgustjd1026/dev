import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { getPublicOrigin } from "@/lib/auth/public-origin";
import { createAdminClient } from "@/lib/supabase/admin";

const STATE_COOKIE = "youtube_oauth_state";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
};

type ChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error_description" in data &&
      typeof data.error_description === "string"
        ? data.error_description
        : data &&
            typeof data === "object" &&
            "error" in data &&
            typeof data.error === "object" &&
            data.error &&
            "message" in data.error &&
            typeof data.error.message === "string"
          ? data.error.message
          : "Google API request failed.";
    throw new Error(message);
  }

  return data as T;
}

function getTokenExpiresAt(expiresIn?: number) {
  if (typeof expiresIn !== "number" || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function GET(request: Request): Promise<Response> {
  const origin = getPublicOrigin(request);
  const user = await getAuthenticatedApiUser();
  const requestUrl = new URL(request.url);
  const profileUrl = new URL("/profile", origin);

  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;

  if (error) {
    profileUrl.searchParams.set("youtube", "denied");
    const response = NextResponse.redirect(profileUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    profileUrl.searchParams.set("youtube", "invalid-state");
    return NextResponse.redirect(profileUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    profileUrl.searchParams.set("youtube", "missing-config");
    return NextResponse.redirect(profileUrl);
  }

  try {
    const redirectUri = new URL("/api/youtube/callback", origin).toString();
    const token = await fetchJson<TokenResponse>(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!token.access_token) {
      throw new Error("Google이 access token을 반환하지 않았습니다.");
    }

    const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelsUrl.searchParams.set("part", "snippet");
    channelsUrl.searchParams.set("mine", "true");

    const channels = await fetchJson<ChannelsResponse>(channelsUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });
    const channel = channels.items?.[0] ?? null;

    if (!channel?.id) {
      profileUrl.searchParams.set("youtube", "no-channel");
      const response = NextResponse.redirect(profileUrl);
      response.cookies.delete(STATE_COOKIE);
      return response;
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("youtube_connections")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle<{ refresh_token: string | null }>();
    const refreshToken = token.refresh_token ?? existing?.refresh_token ?? "";

    if (!refreshToken) {
      throw new Error("Google refresh token을 받지 못했습니다. 다시 연결해주세요.");
    }

    const { error: connectionError } = await admin
      .from("youtube_connections")
      .upsert({
        user_id: user.id,
        channel_id: channel.id,
        channel_title: channel.snippet?.title ?? null,
        access_token: token.access_token,
        refresh_token: refreshToken,
        token_expires_at: getTokenExpiresAt(token.expires_in),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (connectionError) {
      throw new Error(connectionError.message);
    }

    profileUrl.searchParams.set("youtube", "connected");
    const response = NextResponse.redirect(profileUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (callbackError: unknown) {
    profileUrl.searchParams.set("youtube", "error");
    profileUrl.searchParams.set(
      "message",
      callbackError instanceof Error ? callbackError.message : "Unknown error"
    );
    return NextResponse.redirect(profileUrl);
  }
}
