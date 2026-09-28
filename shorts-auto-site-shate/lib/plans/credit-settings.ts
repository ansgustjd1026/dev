import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PLAN_CATALOG } from "./catalog";

export async function getPublicPlanCredits() {
  const fallback = {
    free: PLAN_CATALOG.free.monthlyCredits,
    starter: PLAN_CATALOG.starter.monthlyCredits,
    pro: PLAN_CATALOG.pro.monthlyCredits,
  };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_credit_settings")
    .select("plan, monthly_credit_limit");
  if (error) return fallback;

  for (const row of data ?? []) {
    const plan = row.plan as unknown;
    const monthlyCreditLimit = row.monthly_credit_limit as unknown;
    if ((plan === "free" || plan === "starter" || plan === "pro") && typeof monthlyCreditLimit === "number") {
      fallback[plan] = monthlyCreditLimit;
    }
  }
  return fallback;
}
