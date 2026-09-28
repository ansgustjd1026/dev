import { describe, expect, it } from "vitest";
import {
  VIDEO_VISUAL_STYLE_OPTIONS,
  getSafeVideoVisualStyle,
  getVideoVisualStylePrompt,
} from "./styles";

describe("video visual styles", () => {
  it("keeps every selectable style valid", () => {
    for (const option of VIDEO_VISUAL_STYLE_OPTIONS) {
      expect(getSafeVideoVisualStyle(option.value)).toBe(option.value);
      expect(getVideoVisualStylePrompt(option.value).length).toBeGreaterThan(20);
    }
  });

  it("falls back to cinematic for unknown input", () => {
    expect(getSafeVideoVisualStyle("unknown")).toBe("cinematic");
    expect(getSafeVideoVisualStyle(null)).toBe("cinematic");
  });
});
