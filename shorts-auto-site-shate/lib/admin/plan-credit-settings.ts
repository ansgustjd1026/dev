import "server-only";

import { ADMIN_PLANS, type AdminPlanId } from "@/lib/admin/plans";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlanCreditSetting = {
  plan: AdminPlanId;
  monthlyCreditLimit: number;
};

const defaults: PlanCreditSetting[] = ADMIN_PLANS.map((plan) => ({
  plan: plan.id,
  monthlyCreditLimit: plan.monthlyCreditLimit,
}));

export async function getPlanCreditSettings() {
  const { data, error } = await createAdminClient()
    .from("plan_credit_settings")
    .select("plan, monthly_credit_limit");

  if (error) return { settings: defaults, available: false, error: error.message };

  const values = new Map(
    (data ?? []).flatMap((row) =>
      typeof row.plan === "string" && typeof row.monthly_credit_limit === "number"
        ? [[row.plan, row.monthly_credit_limit] as const]
        : []
    )
  );

  return {
    settings: defaults.map((setting) => ({
      ...setting,
      monthlyCreditLimit: values.get(setting.plan) ?? setting.monthlyCreditLimit,
    })),
    available: true,
    error: "",
  };
}

export async function getPlanCreditLimit(planId: AdminPlanId) {
  const result = await getPlanCreditSettings();
  return result.settings.find((setting) => setting.plan === planId)?.monthlyCreditLimit
    ?? defaults.find((setting) => setting.plan === planId)!.monthlyCreditLimit;
}
