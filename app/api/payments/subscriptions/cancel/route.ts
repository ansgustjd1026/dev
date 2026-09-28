import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const user = await getAuthenticatedApiUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const admin = createAdminClient();
    const { error } = await admin
      .from("billing_subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"]);
    if (error) return NextResponse.json({ error: "해지 예약을 저장하지 못했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "해지 예약에 실패했습니다." }, { status: 500 });
  }
}
