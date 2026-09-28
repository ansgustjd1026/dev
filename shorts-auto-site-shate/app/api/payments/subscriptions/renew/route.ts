import { NextResponse } from "next/server";
import { getAdminPlan } from "@/lib/admin/plans";
import { deleteBillingKey } from "@/lib/payments/toss-billing";
import { chargeSubscription, type BillingSubscriptionRow } from "@/lib/payments/subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: subscriptions, error } = await admin
    .from("billing_subscriptions")
    .select("id, user_id, customer_key, billing_key, plan, status, current_period_start, current_period_end, cancel_at_period_end, payment_fail_count")
    .in("status", ["active", "past_due"])
    .lte("current_period_end", now)
    .limit(100)
    .returns<BillingSubscriptionRow[]>();
  if (error) return NextResponse.json({ error: "구독 갱신 대상을 불러오지 못했습니다." }, { status: 500 });

  let renewed = 0;
  let canceled = 0;
  let failed = 0;
  for (const subscription of subscriptions ?? []) {
    if (subscription.cancel_at_period_end) {
      try {
        await deleteBillingKey(subscription.billing_key);
      } catch {
        // The billing key can already be invalid. The local subscription still must close.
      }
      const freePlan = getAdminPlan("free");
      await Promise.all([
        admin.from("billing_subscriptions").update({ status: "canceled", canceled_at: now, updated_at: now }).eq("id", subscription.id),
        admin.from("user_plans").upsert({ user_id: subscription.user_id, plan: "free", status: "active", monthly_credit_limit: freePlan.monthlyCreditLimit, monthly_credit_limit_override: false, updated_at: now }),
      ]);
      canceled += 1;
      continue;
    }

    try {
      await chargeSubscription({ subscription });
      renewed += 1;
    } catch {
      await admin
        .from("billing_subscriptions")
        .update({
          status: "past_due",
          payment_fail_count: subscription.payment_fail_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, renewed, canceled, failed });
}
