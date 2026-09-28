import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getServerSupabaseConfig } from "@/lib/supabase/config";
import {
  CREDIT_ACTION_LABELS,
  type CreditAction,
  getCreditCost,
  MONTHLY_CREDIT_LIMIT,
} from "./rules";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function createCreditClient(): Promise<SupabaseServerClient> {
  const authorization = (await headers()).get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return createClient();

  const { url, anonKey } = getServerSupabaseConfig();
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  }) as SupabaseServerClient;
}

type CreditUsageRpcResult = {
  ok?: boolean;
  requiredCredits?: number;
  remainingCredits?: number;
};

export type CreditUsageSummary = {
  monthlyLimit: number;
  usedCredits: number;
  remainingCredits: number;
  periodStart: string;
  periodEnd: string;
  actionCounts: Record<CreditAction, number>;
  actionCredits: Record<CreditAction, number>;
};

export class InsufficientCreditsError extends Error {
  requiredCredits: number;
  remainingCredits: number;

  constructor(requiredCredits: number, remainingCredits: number) {
    super(
      `남은 Credit이 부족합니다. 필요: ${requiredCredits}, 남은 Credit: ${remainingCredits}`
    );
    this.name = "InsufficientCreditsError";
    this.requiredCredits = requiredCredits;
    this.remainingCredits = remainingCredits;
  }
}

export class CreditUsageSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditUsageSetupError";
  }
}

function getEmptyActionRecord() {
  return Object.keys(CREDIT_ACTION_LABELS).reduce(
    (acc, action) => ({
      ...acc,
      [action]: 0,
    }),
    {} as Record<CreditAction, number>
  );
}

function getCreditSetupMessage(message: string) {
  return `Credit 사용량 설정을 확인할 수 없습니다. Supabase SQL Editor에서 supabase/credit_usage_events.sql과 supabase/credit_usage_rpc.sql을 먼저 실행해주세요. 원인: ${message}`;
}

function toCreditUsageRpcResult(value: unknown): CreditUsageRpcResult {
  if (!value || typeof value !== "object") return {};

  const result = value as Record<string, unknown>;

  return {
    ok: typeof result.ok === "boolean" ? result.ok : undefined,
    requiredCredits:
      typeof result.requiredCredits === "number"
        ? result.requiredCredits
        : undefined,
    remainingCredits:
      typeof result.remainingCredits === "number"
        ? result.remainingCredits
        : undefined,
  };
}

function toNumberRecord(value: unknown): Record<CreditAction, number> {
  const emptyRecord = getEmptyActionRecord();

  if (!value || typeof value !== "object") return emptyRecord;

  const input = value as Record<string, unknown>;

  for (const action of Object.keys(CREDIT_ACTION_LABELS) as CreditAction[]) {
    emptyRecord[action] =
      typeof input[action] === "number" ? input[action] : 0;
  }

  return emptyRecord;
}

function toCreditUsageSummary(value: unknown): CreditUsageSummary | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;

  const monthlyLimit =
    typeof input.monthlyLimit === "number"
      ? input.monthlyLimit
      : MONTHLY_CREDIT_LIMIT;
  const usedCredits =
    typeof input.usedCredits === "number" ? input.usedCredits : 0;
  const remainingCredits =
    typeof input.remainingCredits === "number"
      ? input.remainingCredits
      : Math.max(0, monthlyLimit - usedCredits);

  return {
    monthlyLimit,
    usedCredits,
    remainingCredits,
    periodStart:
      typeof input.periodStart === "string" ? input.periodStart : "",
    periodEnd: typeof input.periodEnd === "string" ? input.periodEnd : "",
    actionCounts: toNumberRecord(input.actionCounts),
    actionCredits: toNumberRecord(input.actionCredits),
  };
}

export async function getCreditUsageSummary({
  userId,
  supabase,
}: {
  userId: string;
  supabase?: SupabaseServerClient;
}): Promise<CreditUsageSummary> {
  const client = supabase ?? (await createCreditClient());
  void userId;

  const { data, error } = await client.rpc("get_credit_usage_summary");

  if (error) {
    throw new CreditUsageSetupError(getCreditSetupMessage(error.message));
  }

  const summary = toCreditUsageSummary(data);

  if (!summary) {
    throw new CreditUsageSetupError(
      getCreditSetupMessage(
        "get_credit_usage_summary 응답 형식이 올바르지 않습니다."
      )
    );
  }

  return summary;
}

export async function ensureCreditsAvailable({
  userId,
  action,
  requiredCredits,
  supabase,
}: {
  userId: string;
  action: CreditAction;
  requiredCredits?: number;
  supabase?: SupabaseServerClient;
}) {
  const summary = await getCreditUsageSummary({ userId, supabase });
  const credits = requiredCredits ?? getCreditCost(action);

  if (summary.remainingCredits < credits) {
    throw new InsufficientCreditsError(
      credits,
      summary.remainingCredits
    );
  }

  return summary;
}

export async function recordCreditUsage({
  userId,
  action,
  supabase,
  projectId = null,
  status = "success",
  metadata = {},
  creditsOverride,
}: {
  userId: string;
  action: CreditAction;
  supabase?: SupabaseServerClient;
  projectId?: string | null;
  status?: "success" | "failed";
  metadata?: Record<string, unknown>;
  creditsOverride?: number;
}) {
  const client = supabase ?? (await createCreditClient());
  const credits =
    status === "success" ? creditsOverride ?? getCreditCost(action) : 0;

  if (status === "success") {
    const rpcParams: {
      p_action: CreditAction;
      p_project_id: string | null;
      p_metadata: Record<string, unknown>;
      p_credits_override?: number;
    } = {
      p_action: action,
      p_project_id: projectId,
      p_metadata: metadata,
    };

    // Supabase resolves RPC signatures by argument list. Only provide the
    // optional override after the variable-credit migration is in place.
    if (typeof creditsOverride === "number") {
      rpcParams.p_credits_override = creditsOverride;
    }

    const { data, error } = await client.rpc(
      "record_credit_usage_atomic",
      rpcParams
    );

    if (error) {
      throw new CreditUsageSetupError(getCreditSetupMessage(error.message));
    }

    const result = toCreditUsageRpcResult(data);

    if (result.ok === false) {
      throw new InsufficientCreditsError(
        result.requiredCredits ?? credits,
        result.remainingCredits ?? 0
      );
    }

    return;
  }

  const { error } = await client.from("credit_usage_events").insert({
    user_id: userId,
    project_id: projectId,
    action,
    credits_charged: credits,
    status,
    metadata,
  });

  if (error) {
    throw new CreditUsageSetupError(getCreditSetupMessage(error.message));
  }
}

export function getCreditErrorResponse(error: unknown) {
  if (error instanceof InsufficientCreditsError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "INSUFFICIENT_CREDITS",
        help: "Profile 화면에서 이번 달 Credit 사용량을 확인할 수 있습니다.",
        profilePath: "/profile",
        requiredCredits: error.requiredCredits,
        remainingCredits: error.remainingCredits,
      },
      { status: 402 }
    );
  }

  if (error instanceof CreditUsageSetupError) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return null;
}
