import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPlan, type AdminPlanId } from "./plans";

export const ADMIN_USER_LIST_LIMIT = 10;

type RawAdminUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
};

export type AdminUserPlanRow = {
  user_id: string;
  plan: AdminPlanId | string | null;
  status: string | null;
  monthly_credit_limit: number | null;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  plan: AdminPlanId;
  planLabel: string;
  monthlyCreditLimit: number;
  planStatus: string;
};

export type AdminProjectSummary = {
  id: string;
  title: string | null;
  topic: string | null;
  status: string;
  final_video_url: string | null;
  source_video_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCreditUsageEvent = {
  id: string;
  action: string;
  credits_charged: number;
  status: string;
  created_at: string;
};

export type AdminUserProfile = AdminUserListItem & {
  projects: AdminProjectSummary[];
  projectCount: number;
  recentCreditEvents: AdminCreditUsageEvent[];
  monthlyCreditEvents: AdminCreditUsageEvent[];
  usedCreditsThisMonth: number;
  remainingCreditsThisMonth: number;
};

function normalizeSearch(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getAdminAuthErrorMessage(message: string) {
  if (message.toLowerCase().includes("user not allowed")) {
    return "관리자 API 권한이 없습니다. SUPABASE_SERVICE_ROLE_KEY에 anon/public 키가 아니라 service_role 키를 넣었는지 확인해주세요.";
  }

  return message;
}

function getKoreanMonthRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  });
  const [year, month] = formatter.format(now).split("-").map(Number);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, -9, 0, 0));

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

async function getUserPlans(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, AdminUserPlanRow>();

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("user_plans")
    .select("user_id, plan, status, monthly_credit_limit")
    .in("user_id", userIds);

  if (error) {
    return new Map<string, AdminUserPlanRow>();
  }

  return new Map(
    ((data ?? []) as AdminUserPlanRow[]).map((plan) => [plan.user_id, plan])
  );
}

function toListItem(
  user: RawAdminUser,
  planRows: Map<string, AdminUserPlanRow>
): AdminUserListItem {
  const planRow = planRows.get(user.id);
  const plan = getAdminPlan(planRow?.plan);

  return {
    id: user.id,
    email: user.email ?? "이메일 없음",
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    plan: plan.id,
    planLabel: plan.label,
    monthlyCreditLimit: planRow?.monthly_credit_limit ?? plan.monthlyCreditLimit,
    planStatus: planRow?.status ?? "active",
  };
}

export async function listAdminUsers({
  emailQuery,
}: {
  emailQuery?: string;
}) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.auth.admin.listUsers({
    page: 1,
    perPage: ADMIN_USER_LIST_LIMIT,
  });

  if (error) {
    throw new Error(getAdminAuthErrorMessage(error.message));
  }

  const search = normalizeSearch(emailQuery);
  const rawUsers = (data.users ?? []) as RawAdminUser[];
  const filteredUsers = search
    ? rawUsers.filter((user) => user.email?.toLowerCase().includes(search))
    : rawUsers;
  const planRows = await getUserPlans(filteredUsers.map((user) => user.id));

  return {
    users: filteredUsers.map((user) => toListItem(user, planRows)),
    totalLoaded: rawUsers.length,
    isLimited: rawUsers.length >= ADMIN_USER_LIST_LIMIT,
  };
}

async function getProjectSummaries(userId: string) {
  const adminSupabase = createAdminClient();
  let { data, error, count } = await adminSupabase
    .from("projects")
    .select(
      "id, title, topic, status, final_video_url, source_video_url, created_at, updated_at",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error && error.message.toLowerCase().includes("source_video")) {
    const fallback = await adminSupabase
      .from("projects")
      .select("id, title, topic, status, final_video_url, created_at, updated_at", {
        count: "exact",
      })
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20);

    data = fallback.data as typeof data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) {
    return {
      projects: [] as AdminProjectSummary[],
      projectCount: 0,
    };
  }

  return {
    projects: (data ?? []) as AdminProjectSummary[],
    projectCount: count ?? data?.length ?? 0,
  };
}

async function getCreditUsage(userId: string, monthlyCreditLimit: number) {
  const adminSupabase = createAdminClient();
  const { periodStart, periodEnd } = getKoreanMonthRange();

  const { data: recentEvents } = await adminSupabase
    .from("credit_usage_events")
    .select("id, action, credits_charged, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: monthlyEvents } = await adminSupabase
    .from("credit_usage_events")
    .select("id, action, credits_charged, status, created_at")
    .eq("user_id", userId)
    .eq("status", "success")
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  const { data: adjustments } = await adminSupabase
    .from("credit_balance_adjustments")
    .select("amount")
    .eq("user_id", userId)
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  const usedCreditsThisMonth = (monthlyEvents ?? []).reduce(
    (sum, event) =>
      sum +
      (typeof event.credits_charged === "number"
        ? event.credits_charged
        : 0),
    0
  );
  const adjustmentCredits = (adjustments ?? []).reduce(
    (sum, adjustment) =>
      sum + (typeof adjustment.amount === "number" ? adjustment.amount : 0),
    0
  );

  return {
    recentCreditEvents: (recentEvents ?? []) as AdminCreditUsageEvent[],
    monthlyCreditEvents: (monthlyEvents ?? []) as AdminCreditUsageEvent[],
    usedCreditsThisMonth,
    remainingCreditsThisMonth: Math.max(
      0,
      monthlyCreditLimit - usedCreditsThisMonth + adjustmentCredits
    ),
  };
}

export async function getAdminUserProfile(userId: string) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);

  if (error || !data.user) {
    throw new Error(error?.message ?? "사용자를 찾지 못했습니다.");
  }

  const planRows = await getUserPlans([userId]);
  const listItem = toListItem(data.user as RawAdminUser, planRows);
  const { projects, projectCount } = await getProjectSummaries(userId);
  const {
    recentCreditEvents,
    monthlyCreditEvents,
    usedCreditsThisMonth,
    remainingCreditsThisMonth,
  } = await getCreditUsage(userId, listItem.monthlyCreditLimit);

  return {
    ...listItem,
    projects,
    projectCount,
    recentCreditEvents,
    monthlyCreditEvents,
    usedCreditsThisMonth,
    remainingCreditsThisMonth,
  } satisfies AdminUserProfile;
}
