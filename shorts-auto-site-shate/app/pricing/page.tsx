import { redirect } from "next/navigation";
import AppHeader from "@/app/components/AppHeader";
import PageShell from "@/app/components/PageShell";
import Surface from "@/app/components/ui/Surface";
import { getSiteLocale } from "@/lib/i18n/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { PLAN_CATALOG } from "@/lib/plans/catalog";
import { getPublicPlanCredits } from "@/lib/plans/credit-settings";

export default async function PricingPage() {
  const [locale, user, credits] = await Promise.all([getSiteLocale(), getAuthenticatedApiUser(), getPublicPlanCredits()]);
  if (!user) redirect("/login?next=/pricing");
  const isKorean = locale === "ko";

  return (
    <PageShell
      className="px-4 py-4 sm:px-8 sm:py-6"
      contentClassName="mx-auto w-full"
      contentStyle={{ maxWidth: "var(--app-header-max-width)" }}
    >
      <AppHeader
        locale={locale}
      />
      <Surface className="mx-auto max-w-4xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Shate</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {isKorean ? "베타 테스트" : "Beta testing"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isKorean
            ? "모든 새 계정은 Free로 시작합니다. 베타 기간의 Starter 및 Pro 전환은 관리자가 직접 처리합니다."
            : "Every new account starts on Free. During beta, Starter and Pro changes are handled by an administrator."}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(["free", "starter", "pro"] as const).map((planId) => {
            const plan = PLAN_CATALOG[planId];
            return (
              <div key={planId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">{plan.name}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{credits[planId].toLocaleString()}</p>
                <p className="mt-1 text-xs text-slate-500">{isKorean ? "월 크레딧" : "monthly credits"}</p>
              </div>
            );
          })}
        </div>
      </Surface>
    </PageShell>
  );
}
