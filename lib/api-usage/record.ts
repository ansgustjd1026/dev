import "server-only";

import type { ResponseUsage } from "openai/resources/responses/responses";
import { createClient } from "@/lib/supabase/server";
import {
  estimateOpenAICostUsd,
  type ApiUsageMetrics,
} from "./costs";

type UsageStatus = "success" | "failed";

export async function recordApiUsage({
  userId,
  projectId = null,
  operation,
  model,
  status = "success",
  metrics = {},
  priceVariant,
  metadata = {},
}: {
  userId: string;
  projectId?: string | null;
  operation: string;
  model: string;
  status?: UsageStatus;
  metrics?: ApiUsageMetrics;
  priceVariant?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    const estimatedCostUsd = estimateOpenAICostUsd(
      model,
      metrics,
      priceVariant
    );
    const { error } = await supabase.from("api_usage_events").insert({
      user_id: userId,
      project_id: projectId,
      provider: "openai",
      operation,
      model,
      status,
      input_tokens: metrics.inputTokens ?? 0,
      cached_input_tokens: metrics.cachedInputTokens ?? 0,
      output_tokens: metrics.outputTokens ?? 0,
      input_characters: metrics.inputCharacters ?? 0,
      audio_seconds: metrics.audioSeconds ?? 0,
      image_count: metrics.imageCount ?? 0,
      estimated_cost_usd: estimatedCostUsd,
      metadata: {
        ...metadata,
        priceVariant: priceVariant ?? null,
        pricingVersion: "2026-07-30",
      },
    });

    if (error) {
      console.warn("API usage log insert failed", error.message);
    }
  } catch (error) {
    console.warn("API usage logging failed", error);
  }
}

export async function recordOpenAIResponseUsage({
  usage,
  ...input
}: {
  usage?: ResponseUsage | null;
  userId: string;
  projectId?: string | null;
  operation: string;
  model: string;
  metadata?: Record<string, unknown>;
}) {
  return recordApiUsage({
    ...input,
    metrics: {
      inputTokens: usage?.input_tokens ?? 0,
      cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    },
  });
}
