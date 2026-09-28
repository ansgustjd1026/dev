"use client";

import { useState } from "react";
import type { SiteLocale } from "@/lib/i18n/config";

type Subscription = {
  plan: "starter" | "pro";
  status: "active" | "past_due";
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

type Props = { subscription: Subscription | null; locale: SiteLocale };

function formatDate(value: string, locale: SiteLocale) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export default function SubscriptionSettings({ subscription, locale }: Props) {
  const [current, setCurrent] = useState(subscription);
  const [isCanceling, setIsCanceling] = useState(false);
  const [error, setError] = useState("");
  const isKorean = locale === "ko";

  async function scheduleCancellation() {
    if (!current || !window.confirm(isKorean ? "현재 기간이 끝난 뒤 구독을 해지할까요?" : "Cancel when the current period ends?")) return;
    setIsCanceling(true);
    setError("");
    try {
      const response = await fetch("/api/payments/subscriptions/cancel", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not schedule cancellation.");
      setCurrent({ ...current, cancelAtPeriodEnd: true });
    } catch (cancelError: unknown) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not schedule cancellation.");
    } finally {
      setIsCanceling(false);
    }
  }

  if (!current) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold text-slate-950">{isKorean ? "구독" : "Subscription"}</h2><p className="mt-2 text-sm text-slate-600">{isKorean ? "현재 활성화된 유료 구독이 없습니다." : "You do not have an active paid subscription."}</p></section>;
  }

  const isPastDue = current.status === "past_due";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">{isKorean ? "구독" : "Subscription"}</h2><p className="mt-1 text-sm text-slate-600">{current.plan === "pro" ? "Pro" : "Starter"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isPastDue ? "bg-amber-100 text-amber-900" : current.cancelAtPeriodEnd ? "bg-slate-100 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>{isPastDue ? (isKorean ? "결제 확인 필요" : "Payment required") : current.cancelAtPeriodEnd ? (isKorean ? "해지 예약" : "Cancellation scheduled") : (isKorean ? "이용 중" : "Active")}</span></div>
      <p className="mt-5 text-sm text-slate-700">{current.cancelAtPeriodEnd ? (isKorean ? `${formatDate(current.currentPeriodEnd, locale)}까지 이용할 수 있습니다.` : `Available until ${formatDate(current.currentPeriodEnd, locale)}.`) : (isKorean ? `다음 결제일: ${formatDate(current.currentPeriodEnd, locale)}` : `Next billing date: ${formatDate(current.currentPeriodEnd, locale)}`)}</p>
      {isPastDue ? <p className="mt-2 text-sm text-amber-800">{isKorean ? "결제가 완료되지 않았습니다. 카드 정보를 다시 등록해 주세요." : "Your payment did not complete. Please register a payment method again."}</p> : null}
      {!current.cancelAtPeriodEnd && !isPastDue ? <button type="button" onClick={scheduleCancellation} disabled={isCanceling} className="mt-5 min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-950 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">{isCanceling ? (isKorean ? "처리 중" : "Processing") : (isKorean ? "기간 종료 후 해지" : "Cancel at period end")}</button> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
