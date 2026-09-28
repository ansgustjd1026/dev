"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = { paymentKey: string; orderId: string; amount: number; isKorean: boolean };

export default function PaymentConfirm({ paymentKey, orderId, amount, isKorean }: Props) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Payment confirmation failed.");
      if (active) setState("done");
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Payment confirmation failed.");
      setState("error");
    });
    return () => { active = false; };
  }, [amount, orderId, paymentKey]);

  const title = state === "loading" ? (isKorean ? "결제 확인 중" : "Confirming payment") : state === "done" ? (isKorean ? "결제 완료" : "Payment complete") : (isKorean ? "결제 확인 실패" : "Payment confirmation failed");
  return <div className="text-center"><h1 className="text-2xl font-bold text-slate-950">{title}</h1><p className={`mt-3 text-sm ${state === "error" ? "text-red-700" : "text-slate-600"}`}>{state === "loading" ? (isKorean ? "창을 닫지 말고 잠시 기다려주세요." : "Please keep this page open.") : state === "done" ? (isKorean ? "새 요금제가 적용되었습니다." : "Your new plan is active.") : message}</p>{state !== "loading" ? <Link href={state === "done" ? "/profile?tab=credits" : "/pricing"} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white">{state === "done" ? (isKorean ? "확인" : "Continue") : (isKorean ? "다시 시도" : "Try again")}</Link> : null}</div>;
}

