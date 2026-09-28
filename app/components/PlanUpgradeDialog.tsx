"use client";

import { useState } from "react";
import type { SiteLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/ui/cn";

type PlanId = "free" | "starter" | "pro";

type Props = {
  locale: SiteLocale;
  triggerLabel: string;
  className?: string;
  feature?: "download" | "youtube";
};

const PLANS: Array<{
  id: PlanId;
  name: string;
  price: string;
  credits: string;
  projects: string;
  storage: string;
}> = [
  {
    id: "free",
    name: "Free",
    price: "₩0",
    credits: "10",
    projects: "3",
    storage: "150MB",
  },
  {
    id: "starter",
    name: "Starter",
    price: "₩9,900",
    credits: "300",
    projects: "20",
    storage: "1GB",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₩29,900",
    credits: "1,000",
    projects: "100",
    storage: "5GB",
  },
];

export default function PlanUpgradeDialog({
  locale,
  triggerLabel,
  className,
  feature = "download",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("starter");
  const isKorean = locale === "ko";
  const featureLabel =
    feature === "youtube"
      ? isKorean
        ? "YouTube 업로드"
        : "YouTube uploads"
      : isKorean
        ? "영상 다운로드"
        : "video downloads";
  const selectedPlanInfo = PLANS.find((plan) => plan.id === selectedPlan)!;

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={className}>
        {triggerLabel}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-upgrade-title"
          onMouseDown={() => setIsOpen(false)}
        >
          <div
            className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Shate</p>
                <h2 id="plan-upgrade-title" className="mt-1 text-2xl font-bold text-slate-950">
                  {isKorean ? "요금제 선택" : "Choose a plan"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {isKorean
                    ? `${featureLabel}은 Starter 또는 Pro에서 사용할 수 있습니다.`
                    : `${featureLabel} are available with Starter or Pro.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label={isKorean ? "닫기" : "Close"}
              >
                X
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {PLANS.map((plan) => {
                const selected = selectedPlan === plan.id;
                const isFree = plan.id === "free";
                return (
                  <section
                    key={plan.id}
                    className={cn(
                      "relative flex min-h-[310px] flex-col rounded-xl border p-4 transition",
                      selected
                        ? "border-slate-950 bg-white text-slate-950 shadow-[0_0_0_3px_rgba(14,165,233,0.18),0_12px_24px_rgba(15,23,42,0.12)]"
                        : "border-slate-200 bg-white text-slate-950"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold">{plan.name}</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", selected ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-600")}>
                        {plan.credits} credits
                      </span>
                    </div>
                    <p className="mt-5 text-2xl font-bold text-slate-950">
                      {plan.price}
                      <span className="ml-1 text-xs font-medium text-slate-500">
                        / {isKorean ? "월" : "mo"}
                      </span>
                    </p>
                    <ul className="mt-5 space-y-2 text-sm text-slate-600">
                      <li>{isKorean ? `완성 프로젝트 ${plan.projects}개` : `${plan.projects} finished projects`}</li>
                      <li>{isKorean ? `저장공간 ${plan.storage}` : `${plan.storage} storage`}</li>
                      <li>
                        {isFree
                          ? isKorean
                            ? "다운로드 · YouTube 업로드 제외"
                            : "No downloads or YouTube uploads"
                          : isKorean
                            ? "다운로드 · YouTube 업로드 포함"
                            : "Downloads and YouTube uploads"}
                      </li>
                      {!isFree ? (
                        <li className="mt-1 list-none font-semibold text-sky-700">
                          {isKorean
                            ? "자동 제작 및 YouTube 자동 게시"
                            : "Auto-create and YouTube auto-publish"}
                        </li>
                      ) : null}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={cn(
                        "mt-auto min-h-10 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition",
                        selected
                          ? "!border-slate-950 !bg-slate-950 !text-white hover:!bg-slate-800"
                          : "border-slate-300 bg-white text-slate-800 hover:border-slate-950 hover:bg-slate-50"
                      )}
                    >
                      {isFree
                        ? isKorean
                          ? "Free 선택"
                          : "Select Free"
                        : selected
                          ? isKorean
                            ? "선택됨"
                            : "Selected"
                          : isKorean
                            ? "선택"
                            : "Select"}
                    </button>
                  </section>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {selectedPlan === "free"
                  ? isKorean
                    ? "Free는 현재 제한된 기능으로 계속 사용할 수 있습니다."
                    : "Free keeps limited access to Shate."
                  : isKorean
                    ? `${selectedPlanInfo.name} 전환은 베타 기간에 관리자가 처리합니다.`
                    : `${selectedPlanInfo.name} changes are handled by an administrator during beta.`}
              </p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:border-slate-950 hover:bg-slate-50"
              >
                {isKorean ? "닫기" : "Close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
