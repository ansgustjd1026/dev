export type AdminPlanId = "free" | "starter" | "pro";

export type AdminPlan = {
  id: AdminPlanId;
  label: string;
  monthlyCreditLimit: number;
};

export const ADMIN_PLANS: AdminPlan[] = [
  {
    id: "free",
    label: "Free",
    monthlyCreditLimit: 10,
  },
  {
    id: "starter",
    label: "Starter",
    monthlyCreditLimit: 300,
  },
  {
    id: "pro",
    label: "Pro",
    monthlyCreditLimit: 1000,
  },
];

export function getAdminPlan(planId: string | null | undefined) {
  return ADMIN_PLANS.find((plan) => plan.id === planId) ?? ADMIN_PLANS[0];
}

export function isAdminPlanId(value: unknown): value is AdminPlanId {
  return ADMIN_PLANS.some((plan) => plan.id === value);
}
