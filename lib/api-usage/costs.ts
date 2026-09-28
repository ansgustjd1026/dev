export type ApiUsageMetrics = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  inputCharacters?: number;
  audioSeconds?: number;
  imageCount?: number;
};

const PRICE_USD = {
  "gpt-5.6-sol": {
    inputToken: 4 / 1_000_000,
    cachedInputToken: 0.4 / 1_000_000,
    outputToken: 20 / 1_000_000,
  },
  "gpt-5.6-terra": {
    inputToken: 2 / 1_000_000,
    cachedInputToken: 0.2 / 1_000_000,
    outputToken: 12 / 1_000_000,
  },
  "gpt-5.6-luna": {
    inputToken: 0.2 / 1_000_000,
    cachedInputToken: 0.02 / 1_000_000,
    outputToken: 1.2 / 1_000_000,
  },
  "tts-1": { inputCharacter: 15 / 1_000_000 },
  "whisper-1": { audioSecond: 0.006 / 60 },
  "gpt-image-1:low:1024x1536": { image: 0.016 },
  "gpt-image-2:medium:1024x1536": { image: 0.05 },
} as const;

function nonNegative(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export function estimateOpenAICostUsd(
  model: string,
  metrics: ApiUsageMetrics,
  priceVariant?: string
) {
  if (
    model === "gpt-5.6-sol" ||
    model === "gpt-5.6-terra" ||
    model === "gpt-5.6-luna"
  ) {
    const price = PRICE_USD[model];
    const inputTokens = nonNegative(metrics.inputTokens);
    const cachedInputTokens = Math.min(
      inputTokens,
      nonNegative(metrics.cachedInputTokens)
    );
    const uncachedInputTokens = inputTokens - cachedInputTokens;

    return (
      uncachedInputTokens * price.inputToken +
      cachedInputTokens * price.cachedInputToken +
      nonNegative(metrics.outputTokens) * price.outputToken
    );
  }

  if (model === "tts-1") {
    return (
      nonNegative(metrics.inputCharacters) *
      PRICE_USD[model].inputCharacter
    );
  }

  if (model === "whisper-1") {
    return nonNegative(metrics.audioSeconds) * PRICE_USD[model].audioSecond;
  }

  if (model === "gpt-image-1" && priceVariant === "low:1024x1536") {
    return (
      nonNegative(metrics.imageCount) *
      PRICE_USD["gpt-image-1:low:1024x1536"].image
    );
  }

  if (model === "gpt-image-2" && priceVariant === "medium:1024x1536") {
    return (
      nonNegative(metrics.imageCount) *
      PRICE_USD["gpt-image-2:medium:1024x1536"].image
    );
  }

  return 0;
}
