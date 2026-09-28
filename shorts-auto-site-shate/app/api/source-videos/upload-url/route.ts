import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";

const BUCKET = "source-videos";
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function getSafeFileName(value: unknown) {
  if (typeof value !== "string" || !isStringWithinLimit(value, 255, true)) {
    return "source-video.mp4";
  }

  const dotIndex = value.lastIndexOf(".");
  const baseName = dotIndex > 0 ? value.slice(0, dotIndex) : value;
  const extension = dotIndex > 0 ? value.slice(dotIndex + 1) : "mp4";
  const safeExtension = /^(mp4|mov|webm)$/i.test(extension) ? extension : "mp4";
  const safeBaseName =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9가-힣_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "source-video";

  return `${safeBaseName}.${safeExtension.toLowerCase()}`;
}

async function ensureBucket() {
  const admin = createAdminClient();
  const { error: getError } = await admin.storage.getBucket(BUCKET);

  if (getError) {
    const { error: createError } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
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

  let body: {
    fileName?: unknown;
    contentType?: unknown;
    size?: unknown;
  };
  try {
    body = (await readJsonBody(request, 4 * 1024)) as typeof body;
  } catch (error: unknown) {
    return (
      getRequestLimitResponse(error) ??
      NextResponse.json({ error: "업로드 요청을 읽지 못했습니다." }, { status: 500 })
    );
  }
  const contentType =
    typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : 0;

  if (!ALLOWED_TYPES.has(contentType) || size <= 0 || size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "지원하지 않는 영상이거나 파일 크기가 너무 큽니다." },
      { status: 400 }
    );
  }

  try {
    const admin = await ensureBucket();
    const filePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${getSafeFileName(body.fileName)}`;
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(filePath);

    if (error || !data?.signedUrl) throw error ?? new Error("업로드 URL 생성 실패");

    const { data: publicUrlData } = admin.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return NextResponse.json({
      path: filePath,
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드 준비에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedApiUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { path?: unknown };
  try {
    body = (await readJsonBody(request, 4 * 1024)) as typeof body;
  } catch (error: unknown) {
    return (
      getRequestLimitResponse(error) ??
      NextResponse.json({ error: "삭제 요청을 읽지 못했습니다." }, { status: 500 })
    );
  }
  const path = typeof body.path === "string" ? body.path.trim() : "";

  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "잘못된 파일 경로입니다." }, { status: 403 });
  }

  const { error } = await createAdminClient().storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
