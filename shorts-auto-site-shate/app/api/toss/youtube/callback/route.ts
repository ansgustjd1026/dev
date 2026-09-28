import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrigin } from "@/lib/auth/public-origin";
import { connectYouTubeAccount } from "@/lib/youtube/oauth-connect";

function resultPage(success: boolean, message: string) {
  const color = success ? "#067647" : "#b42318";
  const background = success ? "#ecfdf3" : "#fff3f2";
  return new Response(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shate YouTube 연결</title><body style="margin:0;background:#f4f7fb;font-family:system-ui,sans-serif;color:#101828"><main style="min-height:100vh;display:grid;place-content:center;padding:24px;text-align:center"><section style="max-width:420px;padding:28px;border:1px solid #dce4ed;border-radius:8px;background:white"><h1 style="margin:0 0 12px;font-size:24px">${success ? "YouTube 연결 완료" : "YouTube 연결 실패"}</h1><p style="margin:0 0 22px;padding:12px;border-radius:8px;background:${background};color:${color};line-height:1.55">${message}</p><button onclick="window.close()" style="min-height:48px;width:100%;border:0;border-radius:8px;background:#111c32;color:white;font-weight:800">토스 앱으로 돌아가기</button></section></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error")) return resultPage(false, "Google 계정 연결이 취소되었습니다.");
  if (!code || !state) return resultPage(false, "연결 응답을 확인하지 못했습니다.");

  const admin = createAdminClient();
  const { data: savedState } = await admin.from("toss_youtube_oauth_states").select("user_id, expires_at").eq("state", state).maybeSingle<{ user_id: string; expires_at: string }>();
  await admin.from("toss_youtube_oauth_states").delete().eq("state", state);
  if (!savedState || new Date(savedState.expires_at).getTime() < Date.now()) return resultPage(false, "연결 요청이 만료되었습니다. 앱에서 다시 시도해주세요.");

  try {
    const redirectUri = new URL("/api/toss/youtube/callback", getPublicOrigin(request)).toString();
    const channel = await connectYouTubeAccount({ userId: savedState.user_id, code, redirectUri });
    return resultPage(true, `${channel.channelTitle || "YouTube 채널"} 연결이 완료되었습니다. 이 창을 닫고 Shate로 돌아가세요.`);
  } catch (error) {
    return resultPage(false, error instanceof Error ? error.message : "YouTube 채널을 연결하지 못했습니다.");
  }
}
