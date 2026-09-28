"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  authKey: string;
  customerKey: string;
  plan: "starter" | "pro";
  isKorean: boolean;
};

export default function PaymentSubscriptionConfirm({ authKey, customerKey, plan, isKorean }: Props) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/payments/subscriptions/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authKey, customerKey, plan }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Subscription activation failed.");
        if (active) setState("done");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Subscription activation failed.");
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [authKey, customerKey, plan]);

  const title = state === "loading"
    ? isKorean ? "자동결제 설정 중" : "Setting up subscription"
    : state === "done"
      ? isKorean ? "구독이 시작되었습니다" : "Subscription started"
      : isKorean ? "구독 설정 실패" : "Subscription setup failed";

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
      <p className={`mt-3 text-sm ${state === "error" ? "text-red-700" : "text-slate-600"}`}>
        {state === "loading"
          ? isKorean ? "카드 인증과 첫 달 결제를 확인하고 있습니다." : "Confirming card authorization and the first payment."
          : state === "done"
            ? isKorean ? "매월 같은 날 자동으로 갱신됩니다. 프로필에서 언제든 해지 예약할 수 있습니다." : "Your plan renews monthly. You can schedule cancellation in Profile at any time."
            : message}
      </p>
      {state !== "loading" ? (
        <Link href={state === "done" ? "/profile?tab=credits" : "/pricing"} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white">
          {state === "done" ? (isKorean ? "확인" : "Continue") : (isKorean ? "다시 시도" : "Try again")}
        </Link>
      ) : null}
    </div>
  );
}
