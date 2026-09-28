import { NextResponse } from "next/server";
import { getCurrentAdminUser, isCurrentAdminVerified } from "@/lib/admin/auth";
import { ADMIN_PLANS } from "@/lib/admin/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminAuditEvent } from "@/lib/admin/audit-events";
import { readJsonBody } from "@/lib/security/api-limits";

export async function PATCH(request: Request) {
  const admin = await getCurrentAdminUser();
  if (!admin || !(await isCurrentAdminVerified())) return NextResponse.json({ error: "관리자 비밀번호 확인이 필요합니다." }, { status: 403 });
  const body = (await readJsonBody(request, 4_096)) as { credits?: unknown };
  if (!body.credits || typeof body.credits !== "object" || Array.isArray(body.credits)) return NextResponse.json({ error: "플랜별 크레딧 값을 확인해주세요." }, { status: 400 });
  const input = body.credits as Record<string, unknown>;
  const rows = ADMIN_PLANS.map((plan) => ({ plan: plan.id, monthly_credit_limit: input[plan.id], updated_by: admin.id, updated_at: new Date().toISOString() }));
  if (rows.some((row) => typeof row.monthly_credit_limit !== "number" || !Number.isInteger(row.monthly_credit_limit) || row.monthly_credit_limit < 0 || row.monthly_credit_limit > 100_000)) return NextResponse.json({ error: "크레딧은 0부터 100,000 사이의 정수여야 합니다." }, { status: 400 });
  const { error } = await createAdminClient().from("plan_credit_settings").upsert(rows, { onConflict: "plan" });
  if (error) return NextResponse.json({ error: "플랜 크레딧 설정을 저장할 수 없습니다. Supabase SQL Editor에서 supabase/plan_credit_settings.sql을 실행해주세요.", detail: error.message }, { status: 500 });
  await recordAdminAuditEvent({ actorUserId: admin.id, targetUserId: admin.id, action: "credit_limit_changed", metadata: { scope: "plan", credits: Object.fromEntries(rows.map((row) => [row.plan, row.monthly_credit_limit])) } });
  return NextResponse.json({ ok: true });
}
