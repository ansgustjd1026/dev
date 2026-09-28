import { describe, expect, it } from "vitest";
import { ensureMinimumSceneCoverage } from "./route";

describe("ensureMinimumSceneCoverage", () => {
  const captions = Array.from({ length: 12 }, (_, index) => ({
    text: `장면 ${index + 1}에서 갈등이 이어집니다.`,
    start: index * 5,
    end: (index + 1) * 5,
  }));

  it("adds enough transitions when the scene planner returns one image", () => {
    const scenes = ensureMinimumSceneCoverage(
      [
        {
          from: 0,
          to: 0,
          keyword: "첫 장면",
          captionText: captions[0].text,
          query: "opening family conflict",
        },
      ],
      captions
    );

    expect(scenes).toHaveLength(4);
    expect(new Set(scenes.map((scene) => scene.from)).size).toBe(4);
    expect(scenes[scenes.length - 1].to).toBe(captions.length - 1);
  });

  it("keeps a short clip compact", () => {
    const shortCaptions = captions.slice(0, 2).map((caption, index) => ({
      ...caption,
      start: index * 4,
      end: (index + 1) * 4,
    }));

    expect(ensureMinimumSceneCoverage([], shortCaptions)).toHaveLength(1);
  });
});
