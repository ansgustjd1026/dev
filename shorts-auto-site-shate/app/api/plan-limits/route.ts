import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createClient } from "@/lib/supabase/server";
import { getPlanLimits } from "@/lib/plans/limits";

export async function GET() {
  try {
    const user = await getAuthenticatedApiUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { data: planRow } = await supabase
      .from("user_plans")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle();

    const limits = getPlanLimits(
      planRow && typeof planRow.plan === "string" ? planRow.plan : "free"
    );

    const { count: completedProjectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed");
    const { data: completedProjectsWithSize, error: sizeError } = await supabase
      .from("projects")
      .select("final_video_size")
      .eq("user_id", user.id)
      .not("final_video_path", "is", null);
    const completedVideoSizeBytes = sizeError
      ? 0
      : (completedProjectsWithSize ?? []).reduce((sum, project) => {
          const size = project.final_video_size;
          return sum + (typeof size === "number" ? size : 0);
        }, 0);

    return NextResponse.json({
      limits,
      usage: {
        completedProjectCount: completedProjectCount ?? 0,
        completedVideoSizeBytes,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "플랜 제한 정보를 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
