import "server-only";

export function getFfmpegPath() {
  const configuredPath = process.env.FFMPEG_PATH?.trim();
  return configuredPath || "ffmpeg";
}

export function isFfmpegMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const value = error as { code?: unknown };
  return value.code === "ENOENT";
}

export function getFfmpegMissingMessage() {
  return "FFmpeg를 찾을 수 없습니다. FFmpeg를 시스템 PATH에 추가하거나 FFMPEG_PATH 환경변수를 설정해주세요.";
}
