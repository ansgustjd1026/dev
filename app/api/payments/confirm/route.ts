import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { getAdminPlan } from "@/lib/admin/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBillingDisabledMessage,
  isBillingEnabled,
} from "@/lib/payments/billing-feature";
import { enforceRateLimit, getRequestLimitResponse, isStringWithinLimit, readJsonBody } from "@/lib/security/api-limits";

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
    const limited = enforceRateLimit({ key: `payment-confirm:${user.id}`, limit: 8, windowMs: 600_000 });
    if (limited) return limited;
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) return NextResponse.json({ error: "TOSS_SECRET_KEY가 설정되지 않았습니다." }, { status: 503 });

    const body = (await readJsonBody(request, 8 * 1024)) as { paymentKey?: unknown; orderId?: unknown; amount?: unknown };
    const paymentKey = typeof body.paymentKey === "string" && isStringWithinLimit(body.paymentKey, 200) ? body.paymentKey : "";
    const orderId = typeof body.orderId === "string" && isStringWithinLimit(body.orderId, 64) ? body.orderId : "";
    const amount = typeof body.amount === "number" && Number.isInteger(body.amount) ? body.amount : 0;
    if (!paymentKey || !orderId || amount <= 0) return NextResponse.json({ error: "결제 승인 정보를 확인해주세요." }, { status: 400 });

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin.from("payment_orders")
      .select("id, user_id, plan, amount, status").eq("order_id", orderId).eq("user_id", user.id).maybeSingle();
    if (orderError || !order) return NextResponse.json({ error: "저장된 결제 주문을 찾을 수 없습니다." }, { status: 404 });

    const applyPurchasedPlan = async () => {
      const plan = getAdminPlan(order.plan);
      const { error: planError } = await admin.from("user_plans").upsert({
        user_id: user.id,
        plan: plan.id,
        status: "active",
        monthly_credit_limit: plan.monthlyCreditLimit,
        monthly_credit_limit_override: false,
        updated_at: new Date().toISOString(),
      });
      if (planError) {
        throw new Error(
          "결제는 완료됐지만 요금제 적용에 실패했습니다. 다시 시도해주세요."
        );
      }
      return plan;
    };

    if (order.status === "paid") {
      const plan = await applyPurchasedPlan();
      return NextResponse.json({ ok: true, plan: plan.id, alreadyConfirmed: true });
    }
    if (order.status !== "ready" || order.amount !== amount) return NextResponse.json({ error: "주문 금액 또는 상태가 일치하지 않습니다." }, { status: 409 });

    const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": orderId,
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
      cache: "no-store",
    });
    const payment = (await tossResponse.json().catch(() => null)) as Record<string, unknown> | null;
    if (!tossResponse.ok) {
      await admin.from("payment_orders").update({ status: "failed", provider_payload: payment, updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "ready");
      return NextResponse.json({ error: typeof payment?.message === "string" ? payment.message : "결제 승인에 실패했습니다." }, { status: tossResponse.status });
    }
    if (payment?.orderId !== orderId || Number(payment?.totalAmount) !== amount || payment?.status !== "DONE") {
      return NextResponse.json({ error: "결제 승인 응답 검증에 실패했습니다." }, { status: 502 });
    }

    const now = new Date().toISOString();
    const { error: paymentUpdateError } = await admin.from("payment_orders").update({ status: "paid", payment_key: paymentKey, provider_payload: payment, paid_at: now, updated_at: now }).eq("id", order.id).eq("status", "ready");
    if (paymentUpdateError) return NextResponse.json({ error: "결제 기록 저장에 실패했습니다." }, { status: 500 });
    let plan;
    try {
      plan = await applyPurchasedPlan();
    } catch (planError: unknown) {
      return NextResponse.json(
        { error: planError instanceof Error ? planError.message : "결제는 완료됐지만 요금제 적용에 실패했습니다." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, plan: plan.id });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;
    return NextResponse.json({ error: error instanceof Error ? error.message : "결제 승인에 실패했습니다." }, { status: 500 });
  }
}
