import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import {
  getYouTubePublishEventForUser,
  isYouTubeSchemaMissingError,
  processYouTubePublishEvent,
  toSafeYouTubeString,
} from "@/lib/youtube/publish-service";

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = toSafeYouTubeString(url.searchParams.get("jobId"));

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const current = await getYouTubePublishEventForUser({
      eventId: jobId,
      userId: user.id,
    });

    if (current.status === "queued") {
      const processed = await processYouTubePublishEvent(jobId);
      return NextResponse.json(processed);
    }

    return NextResponse.json(current);
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
          error instanceof Error ? error.message : "YouTube 게시 상태 확인에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}
