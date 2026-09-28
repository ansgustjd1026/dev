import { NextResponse } from "next/server";
import { getCurrentAdminUser, isCurrentAdminVerified } from "@/lib/admin/auth";
import { getAdminPlan, isAdminPlanId } from "@/lib/admin/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminAuditEvent } from "@/lib/admin/audit-events";
import {
  getRequestLimitResponse,
  readJsonBody,
} from "@/lib/security/api-limits";

type AdminUserPayload = {
  userId?: unknown;
  plan?: unknown;
  status?: unknown;
  remainingCredits?: unknown;
};

function getKoreanMonthRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  });
  const [year, month] = formatter.format(now).split("-").map(Number);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, -9, 0, 0));

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

function normalizeUserId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function requireAdmin() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    return {
      adminUser: null,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  if (!(await isCurrentAdminVerified())) {
    return {
      adminUser: null,
      response: NextResponse.json(
        { error: "관리자 비밀번호 확인이 필요합니다." },
        { status: 403 }
      ),
    };
  }

  return { adminUser, response: null };
}

export async function PATCH(request: Request) {
  const { adminUser, response } = await requireAdmin();
  if (response) return response;

  try {
    const body = (await readJsonBody(request, 8 * 1024)) as AdminUserPayload;
    const userId = normalizeUserId(body.userId);

    if (!userId || !isAdminPlanId(body.plan)) {
      return NextResponse.json(
        { error: "사용자와 플랜을 확인해주세요." },
        { status: 400 }
      );
    }

    const plan = getAdminPlan(body.plan);
    const adminSupabase = createAdminClient();

    const { data: currentPlan } = await adminSupabase
      .from("user_plans")
      .select("plan, status, monthly_credit_limit")
      .eq("user_id", userId)
      .maybeSingle<{
        plan: string | null;
        status: string | null;
        monthly_credit_limit: number | null;
      }>();

    const { error } = await adminSupabase.from("user_plans").upsert({
      user_id: userId,
      plan: plan.id,
      status: currentPlan?.status === "suspended" ? "suspended" : "active",
      monthly_credit_limit: plan.monthlyCreditLimit,
      monthly_credit_limit_override: false,
      updated_by: adminUser!.id,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json(
        {
          error:
            "플랜 테이블을 확인할 수 없습니다. Supabase SQL Editor에서 supabase/admin_user_plans.sql을 먼저 실행해주세요.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    await recordAdminAuditEvent({
      actorUserId: adminUser!.id,
      targetUserId: userId,
      action: "plan_changed",
      metadata: {
        previousPlan: currentPlan?.plan ?? null,
        plan: plan.id,
        monthlyCreditLimit: plan.monthlyCreditLimit,
      },
    });

    return NextResponse.json({
      ok: true,
      userId,
      plan: plan.id,
      monthlyCreditLimit: plan.monthlyCreditLimit,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message =
      error instanceof Error ? error.message : "플랜 변경 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { adminUser, response } = await requireAdmin();
  if (response) return response;

  try {
    const body = (await readJsonBody(request, 8 * 1024)) as AdminUserPayload;
    const userId = normalizeUserId(body.userId);
    const status = body.status;

    if (!userId || (status !== "active" && status !== "suspended")) {
      return NextResponse.json(
        { error: "사용자와 계정 상태를 확인해주세요." },
        { status: 400 }
      );
    }

    if (userId === adminUser!.id) {
      return NextResponse.json(
        { error: "현재 로그인한 관리자 계정은 정지할 수 없습니다." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const { data: currentPlan } = await adminSupabase
      .from("user_plans")
      .select("plan, monthly_credit_limit")
      .eq("user_id", userId)
      .maybeSingle<{ plan: string | null; monthly_credit_limit: number | null }>();
    const fallbackPlan = getAdminPlan(currentPlan?.plan);

    const { error } = await adminSupabase.from("user_plans").upsert({
      user_id: userId,
      plan: fallbackPlan.id,
      status,
      monthly_credit_limit:
        currentPlan?.monthly_credit_limit ?? fallbackPlan.monthlyCreditLimit,
      monthly_credit_limit_override: false,
      updated_by: adminUser!.id,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json(
        {
          error:
            "계정 상태를 저장할 수 없습니다. Supabase SQL Editor에서 supabase/account_suspension.sql을 먼저 실행해주세요.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    await recordAdminAuditEvent({
      actorUserId: adminUser!.id,
      targetUserId: userId,
      action: status === "suspended" ? "account_suspended" : "account_resumed",
      metadata: { status },
    });

    return NextResponse.json({ ok: true, userId, status });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message =
      error instanceof Error ? error.message : "계정 상태 변경 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { adminUser, response } = await requireAdmin();
  if (response) return response;

  try {
    const body = (await readJsonBody(request, 8 * 1024)) as AdminUserPayload;
    const userId = normalizeUserId(body.userId);

    if (!userId) {
      return NextResponse.json(
        { error: "크레딧을 초기화할 사용자를 확인해주세요." },
        { status: 400 }
      );
    }

    if (body.remainingCredits !== undefined) {
      const remainingCredits = body.remainingCredits;
      if (
        typeof remainingCredits !== "number" ||
        !Number.isInteger(remainingCredits) ||
        remainingCredits < 0 ||
        remainingCredits > 100_000
      ) {
        return NextResponse.json(
          { error: "남은 크레딧은 0부터 100,000 사이의 정수여야 합니다." },
          { status: 400 }
        );
      }

      const adminSupabase = createAdminClient();
      const { data: currentPlan } = await adminSupabase
        .from("user_plans")
        .select("plan, monthly_credit_limit")
        .eq("user_id", userId)
        .maybeSingle<{ plan: string | null; monthly_credit_limit: number | null }>();
      const fallbackPlan = getAdminPlan(currentPlan?.plan);
      const monthlyCreditLimit = currentPlan?.monthly_credit_limit ?? fallbackPlan.monthlyCreditLimit;
      const { periodStart, periodEnd } = getKoreanMonthRange();
      const { data: usageEvents, error: usageError } = await adminSupabase
        .from("credit_usage_events")
        .select("credits_charged")
        .eq("user_id", userId)
        .eq("status", "success")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd);

      if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });

      const usedCredits = (usageEvents ?? []).reduce(
        (sum, event) => sum + (typeof event.credits_charged === "number" ? event.credits_charged : 0),
        0,
      );
      const baseRemainingCredits = Math.max(0, monthlyCreditLimit - usedCredits);
      const adjustmentAmount = remainingCredits - baseRemainingCredits;
      const { error: deleteError } = await adminSupabase
        .from("credit_balance_adjustments")
        .delete()
        .eq("user_id", userId)
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd);

      if (deleteError) {
        return NextResponse.json({
          error: "크레딧 조정 테이블을 확인할 수 없습니다. Supabase SQL Editor에서 supabase/admin_credit_adjustments.sql을 실행해주세요.",
          detail: deleteError.message,
        }, { status: 500 });
      }

      if (adjustmentAmount !== 0) {
        const { error: insertError } = await adminSupabase.from("credit_balance_adjustments").insert({
          user_id: userId,
          amount: adjustmentAmount,
          created_by: adminUser!.id,
          metadata: { remainingCredits, monthlyCreditLimit, usedCredits },
        });
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      await recordAdminAuditEvent({
        actorUserId: adminUser!.id,
        targetUserId: userId,
        action: "remaining_credits_changed",
        metadata: { remainingCredits, adjustmentAmount },
      });

      return NextResponse.json({ ok: true, userId, remainingCredits });
    }

    const { periodStart, periodEnd } = getKoreanMonthRange();
    const adminSupabase = createAdminClient();
    const { count, error } = await adminSupabase
      .from("credit_usage_events")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("status", "success")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (error) {
      return NextResponse.json(
        {
          error:
            "크레딧 로그 테이블을 확인할 수 없습니다. Supabase SQL Editor에서 supabase/credit_usage_events.sql을 먼저 실행해주세요.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    const { error: adjustmentError } = await adminSupabase
      .from("credit_balance_adjustments")
      .delete()
      .eq("user_id", userId)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (adjustmentError) {
      return NextResponse.json(
        {
          error:
            "크레딧 조정 테이블을 확인할 수 없습니다. Supabase SQL Editor에서 supabase/admin_credit_adjustments.sql을 실행해주세요.",
          detail: adjustmentError.message,
        },
        { status: 500 }
      );
    }

    await recordAdminAuditEvent({
      actorUserId: adminUser!.id,
      targetUserId: userId,
      action: "credits_reset",
      metadata: { deletedCount: count ?? 0, adjustmentsCleared: true },
    });

    return NextResponse.json({
      ok: true,
      userId,
      deletedCount: count ?? 0,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message =
      error instanceof Error
        ? error.message
        : "크레딧 초기화 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { adminUser, response } = await requireAdmin();
  if (response) return response;

  try {
    const body = (await readJsonBody(request, 8 * 1024)) as AdminUserPayload;
    const userId = normalizeUserId(body.userId);

    if (!userId) {
      return NextResponse.json(
        { error: "삭제할 사용자를 확인해주세요." },
        { status: 400 }
      );
    }

    if (userId === adminUser!.id) {
      return NextResponse.json(
        { error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAdminAuditEvent({
      actorUserId: adminUser!.id,
      targetUserId: userId,
      action: "account_deleted",
    });

    return NextResponse.json({ ok: true, userId });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const message =
      error instanceof Error ? error.message : "계정 삭제 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
