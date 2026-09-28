import "server-only";

import { randomUUID } from "crypto";
import { getAdminPlan } from "@/lib/admin/plans";
import { PLAN_CATALOG, type PaidPlanId } from "@/lib/plans/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeBillingKey } from "@/lib/payments/toss-billing";

export type BillingSubscriptionRow = {
  id: string;
  user_id: string;
  customer_key: string;
  billing_key: string;
  plan: PaidPlanId;
  status: "active" | "past_due" | "canceled";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  payment_fail_count: number;
};

function addOneMonth(date: Date) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function createSubscriptionOrderId(subscriptionId: string) {
  return `shate-sub-${subscriptionId.slice(0, 8)}-${randomUUID()
    .replaceAll("-", "")
    .slice(0, 16)}`;
}

export async function chargeSubscription({
  subscription,
  customerEmail,
}: {
  subscription: BillingSubscriptionRow;
  customerEmail?: string;
}) {
  const admin = createAdminClient();
  const plan = PLAN_CATALOG[subscription.plan];
  const orderId = createSubscriptionOrderId(subscription.id);
  const now = new Date();

  const { data: order, error: orderError } = await admin
    .from("payment_orders")
    .insert({
      order_id: orderId,
      user_id: subscription.user_id,
      plan: plan.id,
      amount: plan.monthlyPriceKrw,
      currency: "KRW",
      status: "ready",
    })
    .select("id")
    .single<{ id: string }>();

  if (orderError || !order) {
    throw new Error("자동결제 주문을 저장하지 못했습니다.");
  }

  try {
    const payment = await chargeBillingKey({
      billingKey: subscription.billing_key,
      customerKey: subscription.customer_key,
      amount: plan.monthlyPriceKrw,
      orderId,
      orderName: `Shate ${plan.name} 월간 요금제`,
      customerEmail,
    });
    const paidAt = new Date().toISOString();
    const { error: paymentError } = await admin
      .from("payment_orders")
      .update({
        status: "paid",
        payment_key: payment.paymentKey,
        provider_payload: payment.providerPayload,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .eq("id", order.id)
      .eq("status", "ready");
    if (paymentError) throw new Error("자동결제 기록을 저장하지 못했습니다.");

    const periodStart = now.toISOString();
    const periodEnd = addOneMonth(now).toISOString();
    const { error: subscriptionError } = await admin
      .from("billing_subscriptions")
      .update({
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        payment_fail_count: 0,
        updated_at: paidAt,
      })
      .eq("id", subscription.id);
    if (subscriptionError) throw new Error("구독 기간을 갱신하지 못했습니다.");

    const activePlan = getAdminPlan(plan.id);
    const { error: planError } = await admin.from("user_plans").upsert({
      user_id: subscription.user_id,
      plan: activePlan.id,
      status: "active",
      monthly_credit_limit: activePlan.monthlyCreditLimit,
      monthly_credit_limit_override: false,
      updated_at: paidAt,
    });
    if (planError) throw new Error("요금제를 갱신하지 못했습니다.");

    return { periodEnd };
  } catch (error) {
    const message = error instanceof Error ? error.message : "자동결제에 실패했습니다.";
    await admin
      .from("payment_orders")
      .update({
        status: "failed",
        provider_payload: { message },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "ready");
    throw error;
  }
}
