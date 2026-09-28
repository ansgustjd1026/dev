import type { AdminPlanId } from "@/lib/admin/plans";

export type PaidPlanId = Exclude<AdminPlanId, "free">;

export const PLAN_CATALOG = {
  free: { id: "free", name: "Free", monthlyPriceKrw: 0, monthlyCredits: 10 },
  starter: { id: "starter", name: "Starter", monthlyPriceKrw: 9_900, monthlyCredits: 300 },
  pro: { id: "pro", name: "Pro", monthlyPriceKrw: 29_900, monthlyCredits: 1_000 },
} satisfies Record<AdminPlanId, { id: AdminPlanId; name: string; monthlyPriceKrw: number; monthlyCredits: number }>;

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === "starter" || value === "pro";
}

