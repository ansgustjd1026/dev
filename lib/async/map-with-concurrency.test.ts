import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order while limiting active work", async () => {
    let active = 0;
    let peak = 0;

    const result = await mapWithConcurrency([3, 1, 2, 0], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value * 5));
      active -= 1;
      return value * 10;
    });

    expect(result).toEqual([30, 10, 20, 0]);
    expect(peak).toBe(2);
  });

  it("uses one worker for invalid concurrency values", async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3], 0, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value;
    });

    expect(peak).toBe(1);
  });
});
