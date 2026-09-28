import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getRequestLimitResponse,
  readJsonBody,
} from "@/lib/security/api-limits";

type CleanupScope = "audio" | "final" | "all";

type CleanupPayload = {
  projectId?: string | null;
  scope?: CleanupScope;
  deleteProject?: boolean;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeScope(value: unknown): CleanupScope {
  if (value === "audio") return "audio";
  if (value === "final") return "final";
  return "all";
}

async function removeAllFilesInFolder({
  supabase,
  bucket,
  folderPath,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  bucket: string;
  folderPath: string;
}) {
  const { data: files, error: listError } = await supabase.storage
    .from(bucket)
    .list(folderPath, {
      limit: 1000,
      offset: 0,
      sortBy: {
        column: "name",
        order: "asc",
      },
    });

  if (listError) {
    throw new Error(`${bucket} 파일 목록 조회 실패: ${listError.message}`);
  }

  if (!files || files.length === 0) {
    return [];
  }

  const filePaths = files
    .filter((file) => file.name && !file.name.endsWith("/"))
    .map((file) => `${folderPath}/${file.name}`);

  if (filePaths.length === 0) {
    return [];
  }

  const { error: removeError } = await supabase.storage
    .from(bucket)
    .remove(filePaths);

  if (removeError) {
    throw new Error(`${bucket} 파일 삭제 실패: ${removeError.message}`);
  }

  return filePaths;
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

    const body = (await readJsonBody(request, 8 * 1024)) as CleanupPayload;

    const projectId = normalizeText(body.projectId);
    const scope = normalizeScope(body.scope);
    const shouldDeleteProject = body.deleteProject === true;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId가 필요합니다." },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "프로젝트를 찾지 못했습니다." },
        { status: 404 }
      );
    }

    const deleted = {
      audio: [] as string[],
      final: [] as string[],
    };

    if (scope === "audio" || scope === "all") {
      deleted.audio = await removeAllFilesInFolder({
        supabase,
        bucket: "tts-audio",
        folderPath: `${user.id}/${projectId}`,
      });
    }

    if (scope === "final" || scope === "all") {
      deleted.final = await removeAllFilesInFolder({
        supabase,
        bucket: "final-videos",
        folderPath: `${user.id}/${projectId}`,
      });
    }

    if (shouldDeleteProject) {
      const { error: deleteError } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      scope,
      deleted,
      projectDeleted: shouldDeleteProject,
    });
  } catch (error) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    let message = "파일 정리 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
