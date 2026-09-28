"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import type { SiteLocale } from "@/lib/i18n/config";
import type { PlanCreditSetting } from "@/lib/admin/plan-credit-settings";

export default function AdminPlanCreditSettings({ settings, locale }: { settings: PlanCreditSetting[]; locale: SiteLocale }) {
  const router = useRouter();
  const ko = locale === "ko";
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((setting) => [setting.plan, String(setting.monthlyCreditLimit)]))
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    const credits = Object.fromEntries(settings.map((setting) => [setting.plan, Number(values[setting.plan]) ]));
    if (Object.values(credits).some((value) => !Number.isInteger(value) || value < 0 || value > 100_000)) {
      setMessage(ko ? "크레딧은 0부터 100,000 사이의 정수여야 합니다." : "Credits must be an integer from 0 to 100,000.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/plan-credits", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credits }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || (ko ? "저장에 실패했습니다." : "Could not save settings."));
      setMessage(ko ? "플랜별 월 크레딧을 저장했습니다." : "Monthly plan credits saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ko ? "저장에 실패했습니다." : "Could not save settings.");
    } finally {
      setPending(false);
    }
  }

  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-950">{ko ? "플랜별 월 크레딧" : "Monthly credits by plan"}</h2>
    <p className="mt-1 text-sm text-slate-600">{ko ? "가격 화면과 크레딧 사용 한도에 함께 반영됩니다. 개별 사용자 조정은 예외로 유지됩니다." : "Applied to pricing and credit limits. Per-user adjustments remain exceptions."}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">{settings.map((setting) => <label key={setting.plan} className="text-sm font-semibold text-slate-800">
      {setting.plan === "free" ? "Free" : setting.plan === "starter" ? "Starter" : "Pro"}
      <Input type="number" min="0" max="100000" step="1" className="mt-2" value={values[setting.plan] ?? ""} disabled={pending} onChange={(event) => setValues((current) => ({ ...current, [setting.plan]: event.target.value }))} />
    </label>)}</div>
    <div className="mt-4 flex items-center gap-3"><Button type="button" onClick={save} disabled={pending}>{pending ? (ko ? "저장 중..." : "Saving...") : ko ? "크레딧 저장" : "Save credits"}</Button>{message ? <p className="text-sm text-slate-600">{message}</p> : null}</div>
  </section>;
}
