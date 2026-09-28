import { CREDIT_RULES, type CreditAction } from "@/lib/credits/rules";
import type { CreditUsageSummary } from "@/lib/credits/usage";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";
import Badge from "./ui/Badge";

const CREDIT_ACTION_ORDER: CreditAction[] = [
  "script_generate",
  "tts_generate",
  "transcribe_audio",
  "render_video",
  "render_image_video",
];

type Props = {
  summary: CreditUsageSummary | null;
  error: string;
  locale?: SiteLocale;
};

const CREDIT_ACTION_LABELS: Record<SiteLocale, Record<CreditAction, string>> = {
  ko: {
    script_generate: "대본 생성",
    tts_generate: "음성 생성",
    transcribe_audio: "자막 싱크 분석",
    render_video: "최종 쇼츠 합성",
    render_image_video: "자동 생성 쇼츠",
  },
  en: {
    script_generate: "Script generation",
    tts_generate: "Voice generation",
    transcribe_audio: "Caption sync",
    render_video: "Final video render",
    render_image_video: "Auto-generated short",
  },
};

function formatPeriod(value: string, locale: SiteLocale) {
  if (!value) return "-";

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatCreditCost(value: number, locale: SiteLocale) {
  return locale === "ko" ? `${value}/회` : `${value}/use`;
}

export default function CreditUsageCard({ summary, error, locale = "ko" }: Props) {
  const t = getSiteText(locale).profile.credit;

  if (!summary) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <Badge variant="amber" className="uppercase tracking-[0.16em]">
          {locale === "ko" ? "크레딧" : "Credit"}
        </Badge>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900">{t.loadFailed}</h2>
        <p className="mt-3 text-sm leading-6 text-amber-900/80">{t.setupHelp}</p>
        {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
      </section>
    );
  }

  const usagePercent =
    summary.monthlyLimit > 0
      ? Math.min(100, Math.round((summary.usedCredits / summary.monthlyLimit) * 100))
      : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge variant="cyan" className="uppercase tracking-[0.2em]">
            {locale === "ko" ? "크레딧" : "Credit"}
          </Badge>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            {t.monthlyTitle}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {formatPeriod(summary.periodStart, locale)} - {formatPeriod(summary.periodEnd, locale)}{" "}
            {t.periodUsage}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm text-neutral-500">{t.remaining}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {summary.remainingCredits}
            <span className="ml-2 text-base font-medium text-neutral-500">/ {summary.monthlyLimit}</span>
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {t.used} {summary.usedCredits} {t.credits}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-right text-xs font-semibold text-cyan-700">{usagePercent}%</p>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-cyan-600" style={{ width: `${usagePercent}%` }} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {CREDIT_ACTION_ORDER.map((action) => (
          <div
            key={action}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-white"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">
                {CREDIT_ACTION_LABELS[locale][action]}
              </p>
              <Badge variant="neutral" className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px]">
                {formatCreditCost(CREDIT_RULES[action], locale)}
              </Badge>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="text-lg font-semibold text-slate-950">
                {summary.actionCredits[action]}
                <span className="ml-1 text-xs font-medium text-neutral-500">{t.credits}</span>
              </p>
              <p className="text-xs text-neutral-500">{t.totalUses(summary.actionCounts[action])}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
