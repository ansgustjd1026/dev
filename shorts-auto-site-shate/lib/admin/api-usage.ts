import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminApiUsageModelSummary = {
  model: string;
  calls: number;
  estimatedCostUsd: number;
};

export type AdminApiUsageSummary = {
  available: boolean;
  periodStart: string;
  periodEnd: string;
  calls: number;
  activeUsers: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  inputCharacters: number;
  audioSeconds: number;
  imageCount: number;
  estimatedCostUsd: number;
  models: AdminApiUsageModelSummary[];
  error: string;
};

function getKoreanMonthRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  });
  const [year, month] = formatter.format(now).split("-").map(Number);

  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1, -9)).toISOString(),
    periodEnd: new Date(Date.UTC(year, month, 1, -9)).toISOString(),
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function emptySummary(
  periodStart: string,
  periodEnd: string,
  error = ""
): AdminApiUsageSummary {
  return {
    available: !error,
    periodStart,
    periodEnd,
    calls: 0,
    activeUsers: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    inputCharacters: 0,
    audioSeconds: 0,
    imageCount: 0,
    estimatedCostUsd: 0,
    models: [],
    error,
  };
}

export async function getAdminApiUsageSummary(userId?: string) {
  const { periodStart, periodEnd } = getKoreanMonthRange();
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.rpc(
    "get_admin_api_usage_summary",
    {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_user_id: userId ?? null,
    }
  );

  if (error) {
    return emptySummary(periodStart, periodEnd, error.message);
  }
  if (!data || typeof data !== "object") {
    return emptySummary(periodStart, periodEnd, "Invalid API usage summary");
  }

  const input = data as Record<string, unknown>;
  const models = Array.isArray(input.models)
    ? input.models.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const model = value as Record<string, unknown>;
        if (typeof model.model !== "string") return [];
        return [{
          model: model.model,
          calls: toNumber(model.calls),
          estimatedCostUsd: toNumber(model.estimatedCostUsd),
        }];
      })
    : [];

  return {
    available: true,
    periodStart,
    periodEnd,
    calls: toNumber(input.calls),
    activeUsers: toNumber(input.activeUsers),
    inputTokens: toNumber(input.inputTokens),
    cachedInputTokens: toNumber(input.cachedInputTokens),
    outputTokens: toNumber(input.outputTokens),
    inputCharacters: toNumber(input.inputCharacters),
    audioSeconds: toNumber(input.audioSeconds),
    imageCount: toNumber(input.imageCount),
    estimatedCostUsd: toNumber(input.estimatedCostUsd),
    models,
    error: "",
  } satisfies AdminApiUsageSummary;
}
