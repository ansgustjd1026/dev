import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordOperationFailure } from "@/lib/operations/failures";

export { isAllowedYouTubeVideoUrl } from "@/lib/youtube/video-url";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_COMMENT_THREADS_URL =
  "https://www.googleapis.com/youtube/v3/commentThreads";

export type YouTubeConnection = {
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  channel_id: string | null;
  channel_title: string | null;
};

type PublishEvent = {
  id: string;
  user_id: string;
  project_id: string | null;
  video_url: string;
  title: string | null;
  description: string | null;
  pinned_comment: string | null;
  privacy_status: YouTubePrivacyStatus;
  youtube_video_id: string | null;
  youtube_comment_id: string | null;
  status: string;
  error_message?: string | null;
};

export type YouTubePrivacyStatus = "private" | "unlisted" | "public";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
  error?: string;
};

type UploadResponse = {
  id?: string;
  error?: {
    message?: string;
    errors?: Array<{
      reason?: string;
    }>;
  };
};

type CommentThreadResponse = {
  id?: string;
  snippet?: {
    topLevelComment?: {
      id?: string;
    };
  };
};

export type YouTubePublishResult = {
  id: string;
  status: string;
  videoId?: string;
  message?: string;
};

export function toSafeYouTubeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isYouTubeSchemaMissingError(error: {
  message?: string;
  code?: string;
}) {
  const message = (error.message ?? "").toLowerCase();

  return (
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    message.includes("youtube_publish_events") ||
    message.includes("youtube_connections") ||
    (message.includes("schema cache") && message.includes("youtube"))
  );
}

function getTokenExpiresAt(expiresIn?: number) {
  if (typeof expiresIn !== "number" || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function needsRefresh(expiresAt: string | null) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now() + 60_000;
}

function getGoogleClientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth 설정이 필요합니다.");
  }

  return { clientId, clientSecret };
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const errorCode =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "";
    const description =
      data && typeof data === "object" && "error_description" in data && typeof data.error_description === "string"
        ? data.error_description
        : "";
    const nestedMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "object" && data.error && "message" in data.error && typeof data.error.message === "string"
        ? data.error.message
        : "";
    const message = [errorCode, description || nestedMessage].filter(Boolean).join(": ") || "YouTube API request failed.";
    throw new Error(message);
  }

  return data as T;
}

export async function getYouTubeConnection(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("youtube_connections")
    .select(
      "access_token, refresh_token, token_expires_at, channel_id, channel_title"
    )
    .eq("user_id", userId)
    .maybeSingle<YouTubeConnection>();

  if (error) throw error;
  return data;
}

function isRefreshTokenFailure(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid_grant") ||
    normalized.includes("token has been expired") ||
    normalized.includes("token has been revoked") ||
    normalized.includes("token has expired") ||
    normalized.includes("token has been invalidated")
  );
}

function reconnectYouTubeMessage() {
  return "YouTube 연결 권한이 만료되었습니다. 프로필에서 YouTube 연동을 해제한 뒤 다시 연결해주세요.";
}

export async function getYouTubeAccessToken(
  userId: string,
  connection: YouTubeConnection,
  force = false
) {
  if (!force && !needsRefresh(connection.token_expires_at)) {
    return connection.access_token;
  }

  const { clientId, clientSecret } = getGoogleClientConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token",
  });
  let token: TokenResponse;
  try {
    token = await fetchJson<TokenResponse>(GOOGLE_TOKEN_URL, {
      method: "POST",
      body,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (isRefreshTokenFailure(message)) {
      // An invalid refresh grant cannot recover. Remove the unusable connection
      // so the profile shows the real state and offers OAuth connection again.
      await createAdminClient()
        .from("youtube_connections")
        .delete()
        .eq("user_id", userId);
      throw new Error(reconnectYouTubeMessage());
    }
    throw error;
  }

  if (!token.access_token) {
    throw new Error("Google이 access token을 반환하지 않았습니다.");
  }

  await createAdminClient()
    .from("youtube_connections")
    .update({
      access_token: token.access_token,
      token_expires_at: getTokenExpiresAt(token.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return token.access_token;
}

async function downloadVideo(videoUrl: string) {
  const response = await fetch(videoUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("완성 영상을 불러오지 못했습니다.");
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  const arrayBuffer = await response.arrayBuffer();

  return {
    contentType,
    body: Buffer.from(arrayBuffer),
  };
}

function normalizeShortsDescription(value: string) {
  const description = value.trim();
  if (description.toLowerCase().includes("#shorts")) return description;
  return description ? `${description}\n\n#Shorts` : "#Shorts";
}

function getYouTubeUploadErrorMessage(value: string, fallback: string) {
  try {
    const data = JSON.parse(value) as UploadResponse;
    const reason = data.error?.errors?.[0]?.reason;

    if (reason === "youtubeSignupRequired") {
      return "YouTube 채널이 없습니다. YouTube에서 채널을 만든 뒤 프로필에서 다시 연결해주세요.";
    }

    return data.error?.message || fallback;
  } catch {
    return fallback;
  }
}

async function uploadToYouTube({
  accessToken,
  videoUrl,
  title,
  description,
  privacyStatus,
}: {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  privacyStatus: YouTubePrivacyStatus;
}) {
  const video = await downloadVideo(videoUrl);
  const uploadUrl = new URL(YOUTUBE_UPLOAD_URL);
  uploadUrl.searchParams.set("uploadType", "resumable");
  uploadUrl.searchParams.set("part", "snippet,status");

  const initResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": video.contentType,
      "X-Upload-Content-Length": String(video.body.length),
    },
    body: JSON.stringify({
      snippet: {
        title: title || "Untitled short",
        description: normalizeShortsDescription(description),
        categoryId: "22",
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!initResponse.ok) {
    const text = await initResponse.text().catch(() => "");
    if (text) {
      throw new Error(
        getYouTubeUploadErrorMessage(text, "YouTube 업로드를 시작하지 못했습니다.")
      );
    }
    throw new Error(text || "YouTube 업로드 세션을 만들지 못했습니다.");
  }

  const location = initResponse.headers.get("location");
  if (!location) {
    throw new Error("YouTube 업로드 URL을 받지 못했습니다.");
  }

  const uploadResponse = await fetch(location, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": video.contentType,
      "Content-Length": String(video.body.length),
    },
    body: video.body,
  });
  const uploadData = (await uploadResponse.json().catch(() => null)) as
    | UploadResponse
    | null;

  if (!uploadResponse.ok) {
    if (uploadData?.error?.errors?.[0]?.reason === "youtubeSignupRequired") {
      throw new Error(
        "YouTube 채널이 없습니다. YouTube에서 채널을 만든 뒤 프로필에서 다시 연결해주세요."
      );
    }
    throw new Error(
      uploadData?.error?.message || "YouTube 영상 업로드에 실패했습니다."
    );
  }

  if (!uploadData?.id) {
    throw new Error("YouTube video ID를 받지 못했습니다.");
  }

  return uploadData.id;
}

async function postVideoComment({
  accessToken,
  channelId,
  videoId,
  text,
}: {
  accessToken: string;
  channelId: string | null;
  videoId: string;
  text: string;
}) {
  const commentText = text.trim();
  if (!commentText) return null;

  const url = new URL(YOUTUBE_COMMENT_THREADS_URL);
  url.searchParams.set("part", "snippet");
  const data = await fetchJson<CommentThreadResponse>(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      snippet: {
        channelId: channelId || undefined,
        videoId,
        topLevelComment: {
          snippet: { textOriginal: commentText },
        },
      },
    }),
  });

  return data.snippet?.topLevelComment?.id || data.id || null;
}

export async function enqueueYouTubePublishJob({
  userId,
  projectId,
  videoUrl,
  title,
  description,
  pinnedComment,
  privacyStatus,
  forceReupload = false,
}: {
  userId: string;
  projectId: string | null;
  videoUrl: string;
  title: string;
  description: string;
  pinnedComment: string;
  privacyStatus: YouTubePrivacyStatus;
  forceReupload?: boolean;
}) {
  const admin = createAdminClient();
  const connection = await getYouTubeConnection(userId);

  if (!connection) {
    throw new Error("YouTube 계정을 먼저 연결해주세요.");
  }

  if (!forceReupload) {
    const { data: existingEvent, error: existingError } = await admin
      .from("youtube_publish_events")
      .select("id, status, youtube_video_id")
      .eq("user_id", userId)
      .eq("video_url", videoUrl)
      .in("status", ["queued", "uploading", "published"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Pick<PublishEvent, "id" | "status" | "youtube_video_id">>();

    if (existingError) throw existingError;

    if (existingEvent) {
      return {
        id: existingEvent.id,
        status: existingEvent.status,
        videoId: existingEvent.youtube_video_id ?? undefined,
        reused: true,
      };
    }
  }

  const { data, error } = await admin
    .from("youtube_publish_events")
    .insert({
      user_id: userId,
      project_id: projectId,
      video_url: videoUrl,
      title: title || null,
      description: description || null,
      pinned_comment: pinnedComment || null,
      privacy_status: privacyStatus,
      status: "queued",
    })
    .select("id, status")
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    status: data.status as string,
    reused: false,
  };
}

export async function getYouTubePublishEventForUser({
  eventId,
  userId,
}: {
  eventId: string;
  userId: string;
}): Promise<YouTubePublishResult> {
  const { data: event, error } = await createAdminClient()
    .from("youtube_publish_events")
    .select("id, status, youtube_video_id, error_message")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle<
      Pick<PublishEvent, "id" | "status" | "youtube_video_id" | "error_message">
    >();

  if (error) throw error;
  if (!event) throw new Error("YouTube 게시 작업을 찾지 못했습니다.");

  return {
    id: event.id,
    status: event.status,
    videoId: event.youtube_video_id ?? undefined,
    message: event.error_message ?? undefined,
  };
}

export async function processYouTubePublishEvent(
  eventId: string
): Promise<YouTubePublishResult> {
  const admin = createAdminClient();
  const { data: event, error } = await admin
    .from("youtube_publish_events")
    .select("id, user_id, project_id, video_url, title, description, pinned_comment, privacy_status, youtube_video_id, youtube_comment_id, status")
    .eq("id", eventId)
    .maybeSingle<PublishEvent>();

  if (error) throw error;
  if (!event) throw new Error("YouTube 게시 작업을 찾지 못했습니다.");

  if (event.status === "published") {
    return {
      id: event.id,
      status: "published",
      videoId: event.youtube_video_id ?? undefined,
    };
  }

  const connection = await getYouTubeConnection(event.user_id);
  if (!connection) {
    throw new Error("YouTube 계정을 먼저 연결해주세요.");
  }

  try {
    await admin
      .from("youtube_publish_events")
      .update({
        status: "uploading",
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    // Refresh immediately before every upload. Google can invalidate access tokens
    // before the locally stored expiry timestamp is reached.
    const accessToken = await getYouTubeAccessToken(event.user_id, connection, true);
    const videoId = await uploadToYouTube({
      accessToken,
      videoUrl: event.video_url,
      title: event.title || "Untitled short",
      description: event.description || event.title || "",
      privacyStatus: event.privacy_status || "public",
    });

    await admin
      .from("youtube_publish_events")
      .update({
        youtube_video_id: videoId,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    if (event.pinned_comment?.trim()) {
      try {
        const commentId = await postVideoComment({
          accessToken,
          channelId: connection.channel_id,
          videoId,
          text: event.pinned_comment,
        });

        await admin
          .from("youtube_publish_events")
          .update({
            youtube_comment_id: commentId,
            comment_error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id);
      } catch (commentError: unknown) {
        const commentMessage =
          commentError instanceof Error
            ? commentError.message
            : "YouTube 댓글을 등록하지 못했습니다.";

        await admin
          .from("youtube_publish_events")
          .update({
            comment_error_message: commentMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id);
      }
    }

    return {
      id: event.id,
      status: "published",
      videoId,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "YouTube 게시에 실패했습니다.";

    await admin
      .from("youtube_publish_events")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    await recordOperationFailure({
      userId: event.user_id,
      projectId: event.project_id,
      stage: "youtube_publish",
      error,
      metadata: { publishEventId: event.id },
    });

    throw new Error(message);
  }
}
