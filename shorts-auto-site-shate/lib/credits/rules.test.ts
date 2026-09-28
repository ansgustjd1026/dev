import { describe, expect, it } from "vitest";
import {
  CREDIT_ACTION_LABELS,
  CREDIT_RULES,
  MONTHLY_CREDIT_LIMIT,
  getCreditCost,
  type CreditAction,
} from "./rules";

const actions = Object.keys(CREDIT_RULES) as CreditAction[];

describe("credit rules", () => {
  it("keeps every credit action labelled", () => {
    expect(actions).toEqual([
      "script_generate",
      "tts_generate",
      "transcribe_audio",
      "render_video",
      "render_image_video",
    ]);

    for (const action of actions) {
      expect(CREDIT_ACTION_LABELS[action]).toEqual(expect.any(String));
      expect(CREDIT_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });

  it("returns configured costs for each action", () => {
    expect(getCreditCost("script_generate")).toBe(1);
    expect(getCreditCost("tts_generate")).toBe(1);
    expect(getCreditCost("transcribe_audio")).toBe(1);
    expect(getCreditCost("render_video")).toBe(2);
    expect(getCreditCost("render_image_video")).toBe(50);
  });

  it("keeps the free monthly limit below the premium image-video action", () => {
    const maxActionCost = Math.max(...Object.values(CREDIT_RULES));

    expect(MONTHLY_CREDIT_LIMIT).toBeLessThan(maxActionCost);
  });
});
