import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { PLAN_CATALOG, isPaidPlanId } from "@/lib/plans/catalog";
import { getBillingCustomerKey, issueBillingKey } from "@/lib/payments/toss-billing";
import { chargeSubscription, type BillingSubscriptionRow } from "@/lib/payments/subscriptions";
import { enforceRateLimit, getRequestLimitResponse, isStringWithinLimit, readJsonBody } from "@/lib/security/api-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBillingDisabledMessage,
  isBillingEnabled,
} from "@/lib/payments/billing-feature";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    if (!isBillingEnabled()) {
      return NextResponse.json(
        { error: getBillingDisabledMessage() },
        { status: 503 }
      );
    }
    const user = await getAuthenticatedApiUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const limited = enforceRateLimit({ key: `billing-activate:${user.id}`, limit: 5, windowMs: 600_000 });
    if (limited) return limited;

    const body = (await readJsonBody(request, 8 * 1024)) as {
      authKey?: unknown;
      customerKey?: unknown;
      plan?: unknown;
    };
    const authKey = typeof body.authKey === "string" && isStringWithinLimit(body.authKey, 300) ? body.authKey : "";
    const customerKey = typeof body.customerKey === "string" && isStringWithinLimit(body.customerKey, 300) ? body.customerKey : "";
    if (!authKey || !isPaidPlanId(body.plan) || customerKey !== getBillingCustomerKey(user.id)) {
      return NextResponse.json({ error: "자동결제 인증 정보를 확인해주세요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const billingKey = await issueBillingKey({ authKey, customerKey });
    const now = new Date();
    const { data: subscription, error: subscriptionError } = await admin
      .from("billing_subscriptions")
      .upsert({
        user_id: user.id,
        customer_key: customerKey,
        billing_key: billingKey,
        plan: body.plan,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: now.toISOString(),
        cancel_at_period_end: false,
        payment_fail_count: 0,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" })
      .select("id, user_id, customer_key, billing_key, plan, status, current_period_start, current_period_end, cancel_at_period_end, payment_fail_count")
      .single<BillingSubscriptionRow>();
    if (subscriptionError || !subscription) {
      return NextResponse.json({ error: "구독 정보를 저장하지 못했습니다." }, { status: 500 });
    }

    await chargeSubscription({ subscription, customerEmail: user.email ?? undefined });
    return NextResponse.json({ ok: true, plan: PLAN_CATALOG[body.plan].id });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;
    return NextResponse.json({ error: error instanceof Error ? error.message : "자동결제를 시작하지 못했습니다." }, { status: 500 });
  }
}
