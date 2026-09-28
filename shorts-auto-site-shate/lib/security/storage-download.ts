import "server-only";

import { open, rm } from "fs/promises";

type DownloadStorageFileOptions = {
  url: string;
  outputPath: string;
  bucket: "tts-audio" | "background-videos";
  userId: string;
  maxBytes: number;
  timeoutMs?: number;
};

export async function downloadStorageFile({
  url,
  outputPath,
  bucket,
  userId,
  maxBytes,
  timeoutMs = 30_000,
}: DownloadStorageFileOptions) {
  assertAllowedStorageUrl(url, bucket, userId);

  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`파일 다운로드 실패: ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`파일 크기는 ${formatMegabytes(maxBytes)} 이하여야 합니다.`);
  }

  if (!response.body) {
    throw new Error("파일 응답 본문이 없습니다.");
  }

  const file = await open(outputPath, "w");
  const reader = response.body.getReader();
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      receivedBytes += value.byteLength;

      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new Error(
          `파일 크기는 ${formatMegabytes(maxBytes)} 이하여야 합니다.`
        );
      }

      await file.write(value);
    }
  } catch (error) {
    await file.close();
    await rm(outputPath, { force: true });
    throw error;
  }

  await file.close();

  return receivedBytes;
}

function assertAllowedStorageUrl(
  value: string,
  bucket: string,
  userId: string
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("Supabase URL이 설정되지 않았습니다.");
  }

  let requestedUrl: URL;
  let configuredUrl: URL;

  try {
    requestedUrl = new URL(value);
    configuredUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("올바른 파일 URL이 아닙니다.");
  }

  if (
    requestedUrl.origin !== configuredUrl.origin ||
    requestedUrl.username ||
    requestedUrl.password
  ) {
    throw new Error("허용되지 않은 파일 URL입니다.");
  }

  let pathname: string;

  try {
    pathname = decodeURIComponent(requestedUrl.pathname);
  } catch {
    throw new Error("올바른 파일 경로가 아닙니다.");
  }

  const expectedPrefix = `/storage/v1/object/public/${bucket}/${userId}/`;

  if (!pathname.startsWith(expectedPrefix)) {
    throw new Error("현재 사용자의 파일만 처리할 수 있습니다.");
  }

  const relativePath = pathname.slice(expectedPrefix.length);
  const pathSegments = relativePath.split("/");

  if (
    pathSegments.length === 0 ||
    pathSegments.some(
      (segment) => !segment || segment === "." || segment === ".."
    )
  ) {
    throw new Error("올바른 파일 경로가 아닙니다.");
  }
}

function formatMegabytes(bytes: number) {
  return `${Math.floor(bytes / 1024 / 1024)}MB`;
}
