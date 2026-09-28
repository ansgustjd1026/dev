import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { getPlanLimits } from "@/lib/plans/limits";
import { getRequestLimitResponse, readJsonBody } from "@/lib/security/api-limits";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "background-videos";
const ALLOWED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function getSafeStorageFileName(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!/^u_[A-Za-z0-9_-]+\.(mp4|mov|webm)$/i.test(trimmed)) return "";
  return trimmed.slice(0, 500);
}

async function ensureBucket(maxFileSizeBytes: number) {
  const admin = createAdminClient();
  const { error } = await admin.storage.getBucket(BUCKET);
  if (error) {
    const { error: createError } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: maxFileSizeBytes,
      allowedMimeTypes: [...ALLOWED_TYPES],
    });
    if (createError) throw createError;
  }
  return admin;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedApiUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await readJsonBody(request, 8 * 1024)) as {
      storageFileName?: unknown;
      contentType?: unknown;
      size?: unknown;
    };
    const storageFileName = getSafeStorageFileName(body.storageFileName);
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const size = typeof body.size === "number" && Number.isFinite(body.size) ? body.size : 0;

    if (!storageFileName || !ALLOWED_TYPES.has(contentType) || size <= 0) {
      return NextResponse.json({ error: "업로드할 영상 정보를 확인해주세요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: planRow } = await admin
      .from("user_plans")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle();
    const limits = getPlanLimits(typeof planRow?.plan === "string" ? planRow.plan : "free");
    const maxFileSizeBytes = limits.backgroundVideoMaxFileSizeMb * 1024 * 1024;
    const maxStorageBytes = limits.backgroundVideoMaxStorageMb * 1024 * 1024;

    if (size > maxFileSizeBytes) {
      return NextResponse.json(
        { error: `파일은 ${limits.backgroundVideoMaxFileSizeMb}MB 이하여야 합니다.` },
        { status: 413 }
      );
    }

    const storage = await ensureBucket(maxFileSizeBytes);
    const { data: existingFiles, error: listError } = await storage.storage
      .from(BUCKET)
      .list(user.id, { limit: 1000 });
    if (listError) throw listError;

    const files = (existingFiles ?? []).filter((file) => Boolean(file.metadata));
    if (files.length >= limits.backgroundVideoMaxFiles) {
      return NextResponse.json(
        { error: `배경 영상은 최대 ${limits.backgroundVideoMaxFiles}개까지 저장할 수 있습니다.` },
        { status: 409 }
      );
    }

    if (files.some((file) => file.name === storageFileName)) {
      return NextResponse.json({ error: "같은 이름의 영상이 이미 있습니다." }, { status: 409 });
    }

    const usedBytes = files.reduce((sum, file) => {
      const fileSize = file.metadata?.size;
      return sum + (typeof fileSize === "number" ? fileSize : 0);
    }, 0);
    if (usedBytes + size > maxStorageBytes) {
      return NextResponse.json(
        { error: `배경 영상 저장공간 ${limits.backgroundVideoMaxStorageMb}MB를 초과합니다.` },
        { status: 409 }
      );
    }

    const path = `${user.id}/${storageFileName}`;
    const { data, error } = await storage.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) throw error ?? new Error("업로드 권한 생성 실패");

    return NextResponse.json({ path, token: data.token });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드를 준비하지 못했습니다." },
      { status: 500 }
    );
  }
}
