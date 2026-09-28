import { describe, expect, it } from "vitest";
import { estimateOpenAICostUsd } from "./costs";

describe("estimateOpenAICostUsd", () => {
  it("prices Luna cached and uncached tokens separately", () => {
    expect(
      estimateOpenAICostUsd("gpt-5.6-luna", {
        inputTokens: 1_000,
        cachedInputTokens: 400,
        outputTokens: 200,
      })
    ).toBeCloseTo(0.000368, 8);
  });

  it("prices Terra and Sol text tokens", () => {
    const usage = {
      inputTokens: 1_000,
      cachedInputTokens: 400,
      outputTokens: 200,
    };

    expect(estimateOpenAICostUsd("gpt-5.6-terra", usage)).toBeCloseTo(
      0.00368,
      8
    );
    expect(estimateOpenAICostUsd("gpt-5.6-sol", usage)).toBeCloseTo(
      0.00656,
      8
    );
  });

  it("prices speech, transcription, and vertical low-quality images", () => {
    expect(
      estimateOpenAICostUsd("tts-1", { inputCharacters: 1_000 })
    ).toBeCloseTo(0.015, 8);
    expect(
      estimateOpenAICostUsd("whisper-1", { audioSeconds: 60 })
    ).toBeCloseTo(0.006, 8);
    expect(
      estimateOpenAICostUsd(
        "gpt-image-1",
        { imageCount: 3 },
        "low:1024x1536"
      )
    ).toBeCloseTo(0.048, 8);
    expect(
      estimateOpenAICostUsd(
        "gpt-image-2",
        { imageCount: 3 },
        "medium:1024x1536"
      )
    ).toBeCloseTo(0.15, 8);
  });

  it("returns zero for an unknown price", () => {
    expect(estimateOpenAICostUsd("unknown", { inputTokens: 10_000 })).toBe(0);
  });
});
