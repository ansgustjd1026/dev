"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreditUsageSummary } from "@/lib/credits/usage";
import type { SiteLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/ui/cn";

type Props = {
  summary?: CreditUsageSummary | null;
  error?: string;
  className?: string;
  locale?: SiteLocale;
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function getUsedPercent(summary: CreditUsageSummary | null) {
  if (!summary || summary.monthlyLimit <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, (summary.usedCredits / summary.monthlyLimit) * 100)
  );
}

function getPlanStyle(summary: CreditUsageSummary | null) {
  if (summary && summary.monthlyLimit >= 1000) {
    return {
      label: "Pro",
      container: "shadow-[0_5px_18px_rgba(168,85,247,0.18)]",
      labelColor: "text-amber-700",
      ringColors: ["#f59e0b", "#ec4899", "#06b6d4"] as const,
      center: "bg-[linear-gradient(145deg,#ffffff,#fff7ed)]",
    };
  }

  if (summary && summary.monthlyLimit >= 300) {
    return {
      label: "Starter",
      container: "shadow-[0_4px_14px_rgba(14,165,233,0.16)]",
      labelColor: "text-cyan-700",
      ringColors: ["#06b6d4", "#0ea5e9", "#2563eb"] as const,
      center: "bg-[linear-gradient(145deg,#ffffff,#ecfeff)]",
    };
  }

  return {
    label: "Free",
    container: "shadow-sm",
    labelColor: "text-slate-500",
    ringColors: ["#64748b", "#475569", "#334155"] as const,
    center: "bg-[linear-gradient(145deg,#ffffff,#f8fafc)]",
  };
}

export default function CreditFloatingWidget({
  summary,
  error = "",
  className,
  locale = "ko",
}: Props) {
  const [fetchedSummary, setFetchedSummary] = useState<CreditUsageSummary | null>(null);
  const [fetchedError, setFetchedError] = useState("");
  const resolvedSummary = summary === undefined ? fetchedSummary : summary;
  const resolvedError = summary === undefined ? fetchedError : error;

  useEffect(() => {
    if (summary !== undefined) return;

    let active = true;
    void fetch("/api/credits/summary", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { summary?: CreditUsageSummary; error?: string }
          | null;
        if (!active) return;
        if (!response.ok || !data?.summary) {
          setFetchedError(data?.error ?? "크레딧 정보를 불러오지 못했습니다.");
          return;
        }
        setFetchedSummary(data.summary);
      })
      .catch(() => {
        if (active) setFetchedError("크레딧 정보를 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, [summary]);

  const isKorean = locale === "ko";
  const label = isKorean ? "크레딧" : "Credits";
  const title = resolvedSummary
    ? `${label} ${formatCredits(resolvedSummary.remainingCredits)} / ${formatCredits(resolvedSummary.monthlyLimit)}`
    : resolvedError || (isKorean ? "크레딧 확인 필요" : "Check credits");
  const planStyle = getPlanStyle(resolvedSummary);
  const usedPercent = getUsedPercent(resolvedSummary);
  const usedAngle = usedPercent * 3.6;
  const middleAngle = usedAngle * 0.56;

  return (
    <Link
      href="/profile"
      prefetch={false}
      aria-label={title}
      title={title}
      className={cn(
        "credit-profile-widget group relative grid h-12 w-12 shrink-0 place-items-center rounded-full p-[3px] transition hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25",
        planStyle.container,
        className
      )}
      style={{
        background: `conic-gradient(from -90deg, ${planStyle.ringColors[0]} 0deg, ${planStyle.ringColors[1]} ${middleAngle}deg, ${planStyle.ringColors[2]} ${usedAngle}deg, var(--credit-ring-rest, #d7dee7) ${usedAngle}deg 360deg)`,
      }}
    >
      <span className={cn("credit-profile-center grid h-full w-full place-content-center rounded-full text-center leading-none", planStyle.center)}>
        <span className={cn("text-[7px] font-bold uppercase", planStyle.labelColor)}>
          {planStyle.label}
        </span>
        <strong className="credit-profile-value mt-1 max-w-10 overflow-hidden text-ellipsis text-[11px] font-extrabold tabular-nums text-slate-950">
          {resolvedSummary ? formatCredits(resolvedSummary.remainingCredits) : "!"}
        </strong>
      </span>
      <span
        className="credit-profile-badge absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-white bg-slate-950"
        aria-hidden="true"
      >
        <span className="flex flex-col items-center gap-px">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-2.5 rounded-t-full bg-white" />
        </span>
      </span>
      <span className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-max rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white shadow-lg group-hover:block">
        {title}
      </span>
    </Link>
  );
}
