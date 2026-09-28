import { describe, expect, it } from "vitest";
import { isNumericSeparator, normalizeSpokenText } from "./spoken-text";

describe("normalizeSpokenText", () => {
  it("keeps grouped amounts and decimals together", () => {
    expect(normalizeSpokenText("2 , 400 만 원과 3 . 5 배"))
      .toBe("2,400만 원과 3.5배");
  });

  it("removes spaces before regular punctuation", () => {
    expect(normalizeSpokenText("정말 그랬다 , 그런데 또 요구했다 ."))
      .toBe("정말 그랬다, 그런데 또 요구했다.");
  });
});

describe("isNumericSeparator", () => {
  it("distinguishes numeric punctuation from speech pauses", () => {
    expect(isNumericSeparator("2,400", 1, ",")).toBe(true);
    expect(isNumericSeparator("3.5배", 1, ".")).toBe(true);
    expect(isNumericSeparator("말했고, 다시", 3, ",")).toBe(false);
  });
});
