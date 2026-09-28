import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  hasSupabaseServiceRoleKey,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: planRow, error: planError } = await supabase
    .from("user_plans")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  if (planError) {
    return NextResponse.json(
      { error: "요금제 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }

  const plan = typeof planRow?.plan === "string" ? planRow.plan : "free";
  const isAutomationPlan = plan === "starter" || plan === "pro";
  const canPublishToYouTube = isAutomationPlan;
  let isYouTubeConnected = false;

  if (isAutomationPlan && hasSupabaseServiceRoleKey()) {
    try {
      const { data: connection } = await createAdminClient()
        .from("youtube_connections")
        .select("channel_id")
        .eq("user_id", user.id)
        .maybeSingle<{ channel_id: string | null }>();

      isYouTubeConnected = Boolean(connection?.channel_id);
    } catch {
      isYouTubeConnected = false;
    }
  }

  return NextResponse.json({
    canRunAutomation: isAutomationPlan && isYouTubeConnected,
    canPublishToYouTube,
    isYouTubeConnected,
  });
}
