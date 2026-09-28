import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeCaptionEmphasisPoints } from "@/lib/captions/emphasis";
import {
  getSafeVideoVisualStyle,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";
import { getPlanLimits } from "@/lib/plans/limits";
import {
  getRequestLimitResponse,
  readJsonBody,
} from "@/lib/security/api-limits";

type TimedCaption = {
  text: string;
  start: number;
  end: number;
};

type ProjectPayload = {
  projectId?: string | null;

  title?: string | null;
  topic?: string | null;
  script?: string | null;
  voice?: string | null;

  audio_path?: string | null;
  audio_url?: string | null;
  audio_duration?: number | null;

  background_path?: string | null;
  background_url?: string | null;
  background_duration?: number | null;

  final_video_path?: string | null;
  final_video_url?: string | null;
  final_video_size?: number | null;

  timed_captions?: TimedCaption[] | null;
  caption_emphasis?: unknown;
  visual_mode?: unknown;
  visual_style?: unknown;

  status?: string;
};

const ALLOWED_STATUSES = new Set([
  "draft",
  "script_ready",
  "audio_ready",
  "background_selected",
  "final_ready",
  "completed",
]);

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeTimedCaptions(value: unknown) {
  if (!Array.isArray(value)) return null;

  const captions = value
    .map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("text" in item) ||
        !("start" in item) ||
        !("end" in item)
      ) {
        return null;
      }

      const text = normalizeText(item.text);
      const start = normalizeNumber(item.start);
      const end = normalizeNumber(item.end);

      if (!text || start === null || end === null) return null;

      return {
        text,
        start,
        end,
      };
    })
    .filter(Boolean) as TimedCaption[];

  return captions.length > 0 ? captions : null;
}

function normalizeStatus(value: unknown) {
  if (typeof value !== "string") return "draft";
  if (!ALLOWED_STATUSES.has(value)) return "draft";
  return value;
}

function normalizeVisualMode(value: unknown) {
  return value === "images" ? "images" : "background";
}

function isMissingCaptionEmphasisColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  return (
    code === "42703" ||
    message.toLowerCase().includes("caption_emphasis") ||
    message.toLowerCase().includes("column")
  );
}

async function getPlanLimitValues({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const { data } = await supabase
    .from("user_plans")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  const limits = getPlanLimits(
    data && typeof data.plan === "string" ? data.plan : "free"
  );

  return limits;
}

async function getCompletedProjectCount({
  supabase,
  userId,
  excludeProjectId = null,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  excludeProjectId?: string | null;
}) {
  let query = supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed");

  if (excludeProjectId) {
    query = query.neq("id", excludeProjectId);
  }

  const { count } = await query;

  return count ?? 0;
}

async function getCompletedVideoSizeBytes({
  supabase,
  userId,
  excludeProjectId = null,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  excludeProjectId?: string | null;
}) {
  let query = supabase
    .from("projects")
    .select("id, final_video_size")
    .eq("user_id", userId)
    .not("final_video_path", "is", null);

  if (excludeProjectId) {
    query = query.neq("id", excludeProjectId);
  }

  const { data, error } = await query;

  if (error && error.message.toLowerCase().includes("final_video_size")) {
    return 0;
  }

  if (error) throw error;

  return (data ?? []).reduce((sum, project) => {
    const size = project.final_video_size;
    return sum + (typeof size === "number" ? size : 0);
  }, 0);
}

async function ensureCompletedProjectLimit({
  supabase,
  userId,
  projectId = null,
  previousStatus = null,
  nextStatus,
  nextFinalVideoSize = null,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  projectId?: string | null;
  previousStatus?: string | null;
  nextStatus: string;
  nextFinalVideoSize?: number | null;
}) {
  const [limits, completedCount, usedVideoSizeBytes] = await Promise.all([
    getPlanLimitValues({ supabase, userId }),
    getCompletedProjectCount({ supabase, userId, excludeProjectId: projectId }),
    getCompletedVideoSizeBytes({ supabase, userId, excludeProjectId: projectId }),
  ]);

  if (
    nextStatus === "completed" &&
    previousStatus !== "completed" &&
    completedCount >= limits.completedProjectLimit
  ) {
    return NextResponse.json(
      {
        error: `완성된 프로젝트는 현재 요금제에서 최대 ${limits.completedProjectLimit}개까지 저장할 수 있습니다.`,
        code: "COMPLETED_PROJECT_LIMIT_EXCEEDED",
        limit: limits.completedProjectLimit,
        currentCount: completedCount,
      },
      { status: 403 }
    );
  }

  const limitBytes = limits.completedVideoMaxStorageMb * 1024 * 1024;
  const nextSize = nextFinalVideoSize ?? 0;

  if (nextFinalVideoSize !== null && usedVideoSizeBytes + nextSize > limitBytes) {
    return NextResponse.json(
      {
        error: `완성본 저장공간은 현재 요금제에서 최대 ${limits.completedVideoMaxStorageMb}MB까지 사용할 수 있습니다.`,
        code: "COMPLETED_VIDEO_STORAGE_LIMIT_EXCEEDED",
        limitMb: limits.completedVideoMaxStorageMb,
      },
      { status: 403 }
    );
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = (await readJsonBody(request, 256 * 1024)) as ProjectPayload;

    const projectId = normalizeText(body.projectId);
    const normalizedScript = normalizeText(body.script);
    const normalizedCaptionEmphasis = normalizeCaptionEmphasisPoints(
      body.caption_emphasis,
      normalizedScript ?? ""
    );

    const projectData = {
      user_id: user.id,

      title: normalizeText(body.title),
      topic: normalizeText(body.topic),
      script: normalizedScript,
      voice: normalizeText(body.voice),

      audio_path: normalizeText(body.audio_path),
      audio_url: normalizeText(body.audio_url),
      audio_duration: normalizeNumber(body.audio_duration),

      background_path: normalizeText(body.background_path),
      background_url: normalizeText(body.background_url),
      background_duration: normalizeNumber(body.background_duration),

      final_video_path: normalizeText(body.final_video_path),
      final_video_url: normalizeText(body.final_video_url),
      ...(body.final_video_size !== undefined
        ? { final_video_size: normalizeNumber(body.final_video_size) }
        : {}),

      timed_captions: normalizeTimedCaptions(body.timed_captions),
      caption_emphasis:
        normalizedCaptionEmphasis.length > 0 ? normalizedCaptionEmphasis : null,

      visual_mode: normalizeVisualMode(body.visual_mode),
      visual_style: getSafeVideoVisualStyle(body.visual_style) as VideoVisualStyle,

      status: normalizeStatus(body.status),
    };

    const {
      caption_emphasis: _captionEmphasis,
      final_video_size: _finalVideoSize,
      visual_mode: _visualMode,
      visual_style: _visualStyle,
      ...projectDataWithoutOptionalColumns
    } = projectData;
    void _captionEmphasis;
    void _finalVideoSize;
    void _visualMode;
    void _visualStyle;

    if (projectId) {
      const { data: existingProject, error: existingError } = await supabase
        .from("projects")
        .select("id, user_id, status")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .single();

      if (existingError || !existingProject) {
        return NextResponse.json(
          { error: "수정할 프로젝트를 찾지 못했습니다." },
          { status: 404 }
        );
      }

      const limitResponse = await ensureCompletedProjectLimit({
        supabase,
        userId: user.id,
        projectId,
        previousStatus: existingProject.status,
        nextStatus: projectData.status,
        nextFinalVideoSize: projectData.final_video_size,
      });

      if (limitResponse) return limitResponse;

      const { data, error } = await supabase
        .from("projects")
        .update(projectData)
        .eq("id", projectId)
        .eq("user_id", user.id)
        .select("id, status")
        .single();

      if (error && isMissingCaptionEmphasisColumnError(error)) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("projects")
          .update(projectDataWithoutOptionalColumns)
          .eq("id", projectId)
          .eq("user_id", user.id)
          .select("id, status")
          .single();

        if (fallbackError) {
          return NextResponse.json(
            { error: fallbackError.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          projectId: fallbackData.id,
          status: fallbackData.status,
          captionEmphasisSaved: false,
        });
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        projectId: data.id,
        status: data.status,
        captionEmphasisSaved: true,
      });
    }

    const limitResponse = await ensureCompletedProjectLimit({
      supabase,
      userId: user.id,
      nextStatus: projectData.status,
      nextFinalVideoSize: projectData.final_video_size,
    });

    if (limitResponse) return limitResponse;

    const { data, error } = await supabase
      .from("projects")
      .insert(projectData)
      .select("id, status")
      .single();

    if (error && isMissingCaptionEmphasisColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("projects")
        .insert(projectDataWithoutOptionalColumns)
        .select("id, status")
        .single();

      if (fallbackError) {
        return NextResponse.json(
          { error: fallbackError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        projectId: fallbackData.id,
        status: fallbackData.status,
        captionEmphasisSaved: false,
      });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      projectId: data.id,
      status: data.status,
      captionEmphasisSaved: true,
    });
  } catch (error) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    let message = "프로젝트 저장 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
