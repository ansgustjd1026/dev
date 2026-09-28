import {
  CAPTION_EFFECT_OPTIONS,
  type CaptionEffect,
} from "@/lib/captions/effects";

export type CaptionEmphasisPoint = {
  id: string;
  text: string;
  effect: CaptionEffect;
  enabled: boolean;
  reason?: string;
};

const CAPTION_EFFECT_IDS = new Set<string>(
  CAPTION_EFFECT_OPTIONS.map((option) => option.id)
);

export function isCaptionEffect(value: unknown): value is CaptionEffect {
  return typeof value === "string" && CAPTION_EFFECT_IDS.has(value);
}

export function createCaptionEmphasisPoint(
  values: Partial<CaptionEmphasisPoint> = {},
  index = 0
): CaptionEmphasisPoint {
  const text = typeof values.text === "string" ? values.text.trim() : "";
  const safeIdText = text
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .slice(0, 18);

  return {
    id: values.id || `caption-emphasis-${index}-${safeIdText || "custom"}`,
    text,
    effect: isCaptionEffect(values.effect) ? values.effect : "highlight",
    enabled: values.enabled ?? true,
    reason: values.reason?.trim() || "",
  };
}

export function normalizeCaptionEmphasisPoints(
  value: unknown,
  script = "",
  maxPoints = 6
): CaptionEmphasisPoint[] {
  const input = Array.isArray(value) ? value : [];
  const normalized: CaptionEmphasisPoint[] = [];
  const seenTexts = new Set<string>();
  const trimmedScript = script.trim();

  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    const reason =
      typeof record.reason === "string" ? record.reason.trim() : "";
    const enabled =
      typeof record.enabled === "boolean" ? record.enabled : true;
    const effect = isCaptionEffect(record.effect)
      ? record.effect
      : "highlight";

    if (!text || text.length > 40) continue;
    if (trimmedScript && !trimmedScript.includes(text)) continue;
    if (seenTexts.has(text)) continue;

    seenTexts.add(text);
    normalized.push(
      createCaptionEmphasisPoint(
        {
          id: typeof record.id === "string" ? record.id : undefined,
          text,
          effect,
          enabled,
          reason,
        },
        normalized.length + 1
      )
    );

    if (normalized.length >= maxPoints) break;
  }

  return normalized;
}
