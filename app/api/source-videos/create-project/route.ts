import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createClient } from "@/lib/supabase/server";
import {
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";

type SourceVideoProjectPayload = {
  title?: unknown;
  sourceVideoName?: unknown;
  sourceVideoPath?: unknown;
  sourceVideoUrl?: unknown;
  sourceVideoDuration?: unknown;
};

function normalizeText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  if (!isStringWithinLimit(value, maxLength, true)) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

function isMissingSourceVideoColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  return code === "42703" || message.includes("source_video");
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApiUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = (await readJsonBody(
      request,
      8 * 1024
    )) as SourceVideoProjectPayload;

    const sourceVideoPath = normalizeText(body.sourceVideoPath, 1_000);
    const sourceVideoUrl = normalizeText(body.sourceVideoUrl, 2_000);

    if (!sourceVideoPath || !sourceVideoUrl) {
      return NextResponse.json(
        { error: "원본 영상 정보가 비어 있습니다." },
        { status: 400 }
      );
    }

    if (!sourceVideoPath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "본인 영상만 프로젝트로 저장할 수 있습니다." },
        { status: 403 }
      );
    }

    const sourceVideoName =
      normalizeText(body.sourceVideoName, 255) ?? "업로드한 원본 영상";
    const title =
      normalizeText(body.title, 255) ?? sourceVideoName ?? "원본 영상 프로젝트";

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title,
        source_video_name: sourceVideoName,
        source_video_path: sourceVideoPath,
        source_video_url: sourceVideoUrl,
        source_video_duration: normalizeNumber(body.sourceVideoDuration),
        status: "draft",
      })
      .select("id")
      .single();

    if (error && isMissingSourceVideoColumnError(error)) {
      return NextResponse.json(
        {
          error:
            "원본 영상 저장 컬럼이 아직 없습니다. Supabase SQL Editor에서 supabase/source_videos_and_projects.sql을 먼저 실행해주세요.",
        },
        { status: 500 }
      );
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ projectId: data.id });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message =
      error instanceof Error
        ? error.message
        : "원본 영상 프로젝트 저장 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
