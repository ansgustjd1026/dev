import type { AdminPlanId } from "@/lib/admin/plans";

export type PlanLimits = {
  plan: AdminPlanId;
  backgroundVideoMaxFiles: number;
  backgroundVideoMaxStorageMb: number;
  backgroundVideoMaxFileSizeMb: number;
  completedProjectLimit: number;
  completedVideoMaxStorageMb: number;
};

export const PLAN_LIMITS: Record<AdminPlanId, PlanLimits> = {
  free: {
    plan: "free",
    backgroundVideoMaxFiles: 3,
    backgroundVideoMaxStorageMb: 150,
    backgroundVideoMaxFileSizeMb: 50,
    completedProjectLimit: 3,
    completedVideoMaxStorageMb: 150,
  },
  starter: {
    plan: "starter",
    backgroundVideoMaxFiles: 20,
    backgroundVideoMaxStorageMb: 1024,
    backgroundVideoMaxFileSizeMb: 100,
    completedProjectLimit: 20,
    completedVideoMaxStorageMb: 1024,
  },
  pro: {
    plan: "pro",
    backgroundVideoMaxFiles: 60,
    backgroundVideoMaxStorageMb: 3072,
    backgroundVideoMaxFileSizeMb: 250,
    completedProjectLimit: 100,
    completedVideoMaxStorageMb: 5120,
  },
};

export function getPlanLimits(planId: string | null | undefined) {
  if (planId === "starter" || planId === "pro") {
    return PLAN_LIMITS[planId];
  }

  return PLAN_LIMITS.free;
}
