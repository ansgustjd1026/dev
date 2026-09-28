import { describe, expect, it } from "vitest";
import { makeCaptionTextsFromScript } from "./route";

describe("makeCaptionTextsFromScript", () => {
  it("keeps numeric groups together and splits Korean at a natural pause", () => {
    const captions = makeCaptionTextsFromScript(
      "형은 동생에게 2 , 400 만 원을 먼저 내라고 요구했고, 거절하자 가족 단톡방에 흉을 봤습니다.",
      "ko"
    );

    expect(captions).toContain("형은 동생에게 2,400만 원을 먼저 내라고 요구했고");
    expect(captions.some((caption) => /\d,$/.test(caption))).toBe(false);
    expect(captions.join(" ")).toContain("2,400만 원");
  });

  it("does not treat a decimal point as a sentence boundary", () => {
    const captions = makeCaptionTextsFromScript(
      "수수료가 3 . 5 배로 뛰었지만 아무도 먼저 설명하지 않았습니다.",
      "ko"
    );

    expect(captions.join(" ")).toContain("3.5배로");
  });

  it("does not merge the rest of a script after an unmatched closing quote", () => {
    const captions = makeCaptionTextsFromScript(
      '"엄마, 카드값만 막아 줘. 적금 깨면 되잖아." 58살인 나는 석 달 전 재취업했다. 오전엔 마트에서 일하고 오후엔 반찬가게에서 일한다. 어느 날 아들이 퇴근한 나를 붙잡고 카드값을 내 달라고 했다.',
      "ko"
    );

    expect(captions.length).toBeGreaterThan(3);
    expect(Math.max(...captions.map((caption) => caption.length))).toBeLessThanOrEqual(40);
  });
});
