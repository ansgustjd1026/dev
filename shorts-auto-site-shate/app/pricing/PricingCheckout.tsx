"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import type { SiteLocale } from "@/lib/i18n/config";
import type { PaidPlanId } from "@/lib/plans/catalog";
import { PLAN_CATALOG } from "@/lib/plans/catalog";
import { PLAN_LIMITS } from "@/lib/plans/limits";

type Props = {
  locale: SiteLocale;
  initialPlan: PaidPlanId;
  clientKey: string;
  customerKey: string;
  monthlyCredits?: Record<PaidPlanId, number>;
};

export default function PricingCheckout({ locale, initialPlan, clientKey, customerKey, monthlyCredits }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanId>(initialPlan);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const isKorean = locale === "ko";

  async function startSubscription() {
    if (!clientKey) {
      setError(isKorean ? "토스페이먼츠 클라이언트 키가 아직 설정되지 않았습니다." : "The Toss Payments client key is not configured.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/pricing/subscription/success?plan=${selectedPlan}`,
        failUrl: `${window.location.origin}/pricing/fail`,
        flowMode: "DEFAULT",
      });
    } catch (paymentError: unknown) {
      setError(paymentError instanceof Error ? paymentError.message : (isKorean ? "결제를 시작하지 못했습니다." : "Could not start payment."));
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {(["starter", "pro"] as const).map((planId) => {
          const plan = PLAN_CATALOG[planId];
          const limits = PLAN_LIMITS[planId];
          const selected = selectedPlan === planId;
          const credits = monthlyCredits?.[planId] ?? plan.monthlyCredits;
          return (
            <button type="button" key={planId} onClick={() => setSelectedPlan(planId)} className={`rounded-xl border p-5 text-left transition ${selected ? "border-slate-950 bg-slate-50 shadow-[0_0_0_3px_rgba(14,165,233,0.16)]" : "border-slate-200 bg-white hover:border-slate-400"}`}>
              <div className="flex items-center justify-between gap-3"><strong className="text-xl text-slate-950">{plan.name}</strong><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{credits.toLocaleString()} credits</span></div>
              <p className="mt-5 text-3xl font-bold text-slate-950">₩{plan.monthlyPriceKrw.toLocaleString()}<span className="ml-1 text-sm font-medium text-slate-500">/ {isKorean ? "월" : "mo"}</span></p>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                <li>{isKorean ? `완성 프로젝트 ${limits.completedProjectLimit}개` : `${limits.completedProjectLimit} completed projects`}</li>
                <li>{isKorean ? `완성 영상 저장 ${limits.completedVideoMaxStorageMb / 1024}GB` : `${limits.completedVideoMaxStorageMb / 1024}GB final video storage`}</li>
                <li>{isKorean ? "다운로드 · YouTube 업로드" : "Downloads and YouTube uploads"}</li>
                <li className="font-semibold text-sky-800">
                  {isKorean
                    ? "전체 자동 제작 · YouTube 게시"
                    : "Full auto-create and YouTube publishing"}
                </li>
              </ul>
              <span className={`mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-lg border px-4 text-sm font-semibold ${selected ? "border-slate-950 bg-slate-950 !text-white" : "border-slate-300 bg-white text-slate-900"}`}>{selected ? (isKorean ? "선택됨" : "Selected") : (isKorean ? "선택" : "Select")}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <p className="mt-5 text-center text-xs text-slate-500">{isKorean ? "첫 달 결제 후 매월 자동 갱신됩니다. 언제든 기간 종료 예약으로 해지할 수 있습니다." : "Your first month is charged after card authorization and renews monthly. Cancel anytime at period end."}</p>
      <button type="button" onClick={startSubscription} disabled={isLoading} className="mt-4 min-h-12 w-full rounded-xl border border-slate-950 bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">{isLoading ? (isKorean ? "카드 인증창 여는 중" : "Opening card authorization") : (isKorean ? `${PLAN_CATALOG[selectedPlan].name} 구독 시작` : `Start ${PLAN_CATALOG[selectedPlan].name}`)}</button>
    </div>
  );
}
