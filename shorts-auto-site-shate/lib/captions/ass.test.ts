import { describe, expect, it } from "vitest";
import { compressTimedCaptions, createSubtitleAssContent } from "./ass";

describe("createSubtitleAssContent", () => {
  it("shows a caption beginning at zero without a fade-in", () => {
    const result = createSubtitleAssContent({
      timedCaptions: [
        { text: "첫 자막", start: 0, end: 1.5 },
        { text: "다음 자막", start: 1.5, end: 3 },
      ],
    });

    const events = result.assContent.split("\n").filter((line) => line.startsWith("Dialogue:"));
    expect(events[0]).toContain(",첫 자막");
    expect(events[0]).not.toContain("\\fad");
    expect(events[1]).toContain("\\fad");
  });

  it("applies a burst animation only to the selected keyword", () => {
    const result = createSubtitleAssContent({
      timedCaptions: [{ text: "충격적인 금액이 나왔다", start: 1, end: 2 }],
      captionEmphasis: [
        { id: "burst", text: "충격적인 금액", effect: "burst", enabled: true },
      ],
    });

    expect(result.assContent).toContain("\\fscx136");
    expect(result.assContent).toContain("충격적인 금액");
  });

  it("uses a Korean-capable font for rendered captions", () => {
    const result = createSubtitleAssContent({
      timedCaptions: [{ text: "한글 자막", start: 0, end: 1 }],
    });

    expect(result.assContent).toContain(
      process.platform === "win32" ? "Malgun Gothic" : "Noto Sans CJK KR"
    );
    expect(result.assContent).not.toContain("Style: Default,Arial,");
  });
});

describe("compressTimedCaptions", () => {
  it("groups a long narration into render-safe caption events", () => {
    const captions = Array.from({ length: 750 }, (_, index) => ({
      text: `caption ${index}`,
      start: index * 0.3,
      end: index * 0.3 + 0.3,
    }));

    const compressed = compressTimedCaptions(captions);

    expect(compressed.length).toBeLessThanOrEqual(500);
    expect(compressed.every((caption) => caption.text.length <= 200)).toBe(true);
    expect(compressed[0]).toMatchObject({ start: 0 });
    expect(compressed.at(-1)?.end).toBeCloseTo(225);
  });
});
