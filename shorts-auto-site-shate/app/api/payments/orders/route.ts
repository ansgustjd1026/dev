import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBillingDisabledMessage,
  isBillingEnabled,
} from "@/lib/payments/billing-feature";
import { isPaidPlanId, PLAN_CATALOG } from "@/lib/plans/catalog";
import { enforceRateLimit, getRequestLimitResponse, readJsonBody } from "@/lib/security/api-limits";

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
    const limited = enforceRateLimit({ key: `payment-order:${user.id}`, limit: 10, windowMs: 600_000 });
    if (limited) return limited;
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown };
    if (!isPaidPlanId(body.plan)) return NextResponse.json({ error: "결제할 요금제를 확인해주세요." }, { status: 400 });
    const plan = PLAN_CATALOG[body.plan];
    const orderId = `shate-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const { error } = await createAdminClient().from("payment_orders").insert({
      order_id: orderId, user_id: user.id, plan: plan.id, amount: plan.monthlyPriceKrw, currency: "KRW", status: "ready",
    });
    if (error) return NextResponse.json({ error: "결제 주문을 저장하지 못했습니다.", detail: error.message }, { status: 500 });
    return NextResponse.json({ orderId, orderName: `Shate ${plan.name} 월간 요금제`, amount: plan.monthlyPriceKrw, customerKey: user.id, customerEmail: user.email ?? undefined });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;
    return NextResponse.json({ error: error instanceof Error ? error.message : "결제 주문 생성에 실패했습니다." }, { status: 500 });
  }
}
