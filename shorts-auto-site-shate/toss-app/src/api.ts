import { authorizedApiRequest, getSupabaseClient } from "./supabase";

export async function readApiJson<T>(path: string, init: RequestInit = {}) {
  const response = await authorizedApiRequest(path, init);
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "요청을 완료하지 못했습니다.");
  if (!data) throw new Error("서버 응답을 확인하지 못했습니다.");
  return data;
}

export async function postJson<T>(path: string, body: Record<string, unknown>) {
  return readApiJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function generateSpeech(text: string, voice: string) {
  const response = await authorizedApiRequest("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "음성을 생성하지 못했습니다.");
  }
  return response.blob();
}

export async function uploadAudio({ userId, projectId, voice, blob }: { userId: string; projectId: string; voice: string; blob: Blob }) {
  const supabase = await getSupabaseClient();
  const path = `${userId}/${projectId}/audio-${crypto.randomUUID()}-${voice}.mp3`;
  const { error } = await supabase.storage.from("tts-audio").upload(path, blob, { contentType: "audio/mpeg" });
  if (error) throw new Error(error.message);
  const url = supabase.storage.from("tts-audio").getPublicUrl(path).data.publicUrl;
  return { path, url };
}

export function getAudioDuration(url: string) {
  return new Promise<number>((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => Number.isFinite(audio.duration) ? resolve(audio.duration) : reject(new Error("음성 길이를 확인하지 못했습니다."));
    audio.onerror = () => reject(new Error("음성 파일을 읽지 못했습니다."));
    audio.src = url;
  });
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
