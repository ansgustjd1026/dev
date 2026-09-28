import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRequestLimitResponse,
  readJsonBody,
} from "@/lib/security/api-limits";
import {
  enqueueYouTubePublishJob,
  isAllowedYouTubeVideoUrl,
  isYouTubeSchemaMissingError,
  processYouTubePublishEvent,
  toSafeYouTubeString,
  type YouTubePrivacyStatus,
} from "@/lib/youtube/publish-service";

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    videoUrl?: unknown;
    title?: unknown;
    description?: unknown;
    pinnedComment?: unknown;
    privacyStatus?: unknown;
    projectId?: unknown;
    forceReupload?: unknown;
  };
  try {
    body = (await readJsonBody(request, 16_384)) as typeof body;
  } catch (error: unknown) {
    return (
      getRequestLimitResponse(error) ??
      NextResponse.json({ error: "게시 요청을 읽지 못했습니다." }, { status: 500 })
    );
  }
  const videoUrl = toSafeYouTubeString(body.videoUrl);
  const title = toSafeYouTubeString(body.title).slice(0, 100);
  const description = toSafeYouTubeString(body.description).slice(0, 5000);
  const pinnedComment = toSafeYouTubeString(body.pinnedComment).slice(0, 10_000);
  const privacyStatus: YouTubePrivacyStatus =
    body.privacyStatus === "public" || body.privacyStatus === "unlisted"
      ? body.privacyStatus
      : body.privacyStatus === "private"
        ? "private"
        : "public";
  const projectId = toSafeYouTubeString(body.projectId) || null;
  const forceReupload = body.forceReupload === true;

  if (!isAllowedYouTubeVideoUrl(videoUrl, user.id)) {
    return NextResponse.json(
      { error: "YouTube 게시에는 외부에서 접근 가능한 HTTPS 영상 URL이 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: planRow } = await supabase
    .from("user_plans")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  const plan = typeof planRow?.plan === "string" ? planRow.plan : "free";
  if (plan === "free") {
    return NextResponse.json(
      { error: "YouTube 업로드는 Starter 이상 요금제에서 사용할 수 있습니다." },
      { status: 403 }
    );
  }

  try {
    const job = await enqueueYouTubePublishJob({
      userId: user.id,
      projectId,
      videoUrl,
      title,
      description,
      pinnedComment,
      privacyStatus,
      forceReupload,
    });
    if (job.reused) {
      return NextResponse.json({
        id: job.id,
        status: job.status,
        videoId: job.videoId,
        reused: true,
      });
    }
    const result = await processYouTubePublishEvent(job.id);

    return NextResponse.json({
      ...result,
      queued: true,
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      isYouTubeSchemaMissingError(error as { message?: string; code?: string })
    ) {
      return NextResponse.json(
        {
          error:
            "YouTube 자동 게시 설정이 아직 적용되지 않았습니다. Supabase에서 youtube_publish.sql을 실행해주세요.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "YouTube 자동 게시에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}
