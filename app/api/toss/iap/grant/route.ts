import { NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/lib/auth/api-user";
import { getAdminPlan } from "@/lib/admin/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTossIapOrder } from "@/lib/toss/login";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.apps\.tossmini\.com$/i;
const LOCAL_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGIN_PATTERN.test(origin) || LOCAL_ORIGIN_PATTERN.test(origin) ? origin : "";
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function getPlanForSku(sku: string) {
  const starterSku = process.env.TOSS_IAP_STARTER_SKU;
  const proSku = process.env.TOSS_IAP_PRO_SKU;
  if (!starterSku || !proSku) throw new Error("토스 인앱결제 SKU가 설정되지 않았습니다.");
  if (sku === starterSku) return "starter" as const;
  if (sku === proSku) return "pro" as const;
  return null;
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: corsHeaders(request) });

    const body = (await request.json()) as { orderId?: unknown; sku?: unknown };
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    if (!orderId || orderId.length > 200 || !sku || sku.length > 120) {
      return NextResponse.json({ error: "인앱결제 주문 정보를 확인해주세요." }, { status: 400, headers: corsHeaders(request) });
    }

    const admin = createAdminClient();
    const { data: tossAccount, error: tossAccountError } = await admin
      .from("toss_login_accounts")
      .select("toss_user_key")
      .eq("user_id", user.id)
      .maybeSingle<{ toss_user_key: string }>();
    if (tossAccountError || !tossAccount?.toss_user_key) {
      return NextResponse.json({ error: "토스 로그인 계정을 확인하지 못했습니다." }, { status: 403, headers: corsHeaders(request) });
    }
    const verifiedOrder = await getTossIapOrder({ orderId, userKey: tossAccount.toss_user_key });
    if (verifiedOrder.orderId !== orderId || verifiedOrder.sku !== sku || (verifiedOrder.status !== "PAYMENT_COMPLETED" && verifiedOrder.status !== "PURCHASED")) {
      return NextResponse.json({ error: "토스에서 결제 완료 주문을 확인하지 못했습니다." }, { status: 409, headers: corsHeaders(request) });
    }
    const planId = getPlanForSku(sku);
    if (!planId) return NextResponse.json({ error: "등록되지 않은 인앱결제 상품입니다." }, { status: 400, headers: corsHeaders(request) });
    const { data: existing, error: orderError } = await admin
      .from("toss_iap_orders")
      .select("user_id, plan, status")
      .eq("order_id", orderId)
      .maybeSingle<{ user_id: string; plan: string; status: string }>();
    if (orderError) throw new Error("인앱결제 주문 기록을 조회하지 못했습니다. SQL 설정을 확인해주세요.");
    if (existing && (existing.user_id !== user.id || existing.plan !== planId)) {
      return NextResponse.json({ error: "이미 다른 계정에 처리된 주문입니다." }, { status: 409, headers: corsHeaders(request) });
    }

    if (!existing) {
      const { error: insertError } = await admin.from("toss_iap_orders").insert({ order_id: orderId, user_id: user.id, sku, plan: planId });
      if (insertError) throw new Error("인앱결제 주문을 기록하지 못했습니다.");
    }

    const plan = getAdminPlan(planId);
    const { error: planError } = await admin.from("user_plans").upsert({
      user_id: user.id,
      plan: plan.id,
      status: "active",
      monthly_credit_limit: plan.monthlyCreditLimit,
      monthly_credit_limit_override: false,
      updated_at: new Date().toISOString(),
    });
    if (planError) throw new Error("결제는 완료됐지만 요금제를 적용하지 못했습니다.");

    return NextResponse.json({ ok: true, plan: plan.id }, { headers: corsHeaders(request) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "인앱결제 상품을 지급하지 못했습니다." },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
