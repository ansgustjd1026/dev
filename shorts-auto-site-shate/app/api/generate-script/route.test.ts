import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  randomInt: vi.fn((max: number) => max - 1),
  admin: vi.fn(() => { throw new Error("Script generation must not query channel history"); }),
}));

vi.mock("node:crypto", () => ({ randomInt: mocks.randomInt }));
vi.mock("openai", () => ({
  default: class { responses = { create: mocks.generate }; },
}));
vi.mock("@/lib/auth/api-user", () => ({
  getAuthenticatedApiUser: vi.fn(async () => ({ id: "script-test-user" })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/operations/failures", () => ({ recordOperationFailure: vi.fn() }));
vi.mock("@/lib/api-usage/record", () => ({ recordOpenAIResponseUsage: vi.fn() }));
vi.mock("@/lib/credits/usage", () => ({
  ensureCreditsAvailable: vi.fn(),
  recordCreditUsage: vi.fn(),
  getCreditErrorResponse: vi.fn(),
}));

import { POST } from "./route";

describe("script generation without YouTube history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "test-only");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([false, true])("preserves the topic and webtoon style (expansion: %s)", async (expand) => {
    const topic = "A friend shares my private message at school";
    const script = "My friend shared my private message with the class. ".repeat(20);
    if (expand) mocks.generate.mockResolvedValueOnce({ output_text: "A short opening." });
    mocks.generate.mockResolvedValue({ output_text: script });

    const response = await POST(new Request("http://localhost/api/generate-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, durationSeconds: 30, language: "en", visualStyle: "webtoon" }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.topic).toBe(topic);
    expect(data.script).toContain("My friend shared my private message");
    expect(data).not.toHaveProperty("audienceSummary");
    expect(data).not.toHaveProperty("audienceApplied");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.randomInt).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(expand ? 2 : 1);
    for (const [args] of mocks.generate.mock.calls) {
      expect(args.input).toContain(topic);
      expect(args.input).toContain("10~20대");
      expect(args.input).toContain("사용자가 직접 입력한 주제");
      expect(args.input).not.toMatch(/채널 분석|최근 채널 영상|시청자 참고 정보/);
    }
  });

  it.each(["cinematic", "webtoon"])("uses randomly selected material for automatic %s topics", async (visualStyle) => {
    const topic = "Volunteers disagree about how to divide event costs";
    mocks.generate
      .mockResolvedValueOnce({ output_text: topic })
      .mockResolvedValueOnce({ output_text: "A short opening." })
      .mockResolvedValueOnce({ output_text: "The group discussed a fair way to share the work. ".repeat(20) });

    const response = await POST(new Request("http://localhost/api/generate-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "", durationSeconds: 30, language: "en", visualStyle }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).topic).toBe(topic);
    expect(mocks.randomInt).toHaveBeenCalledTimes(4);
    const prompt = mocks.generate.mock.calls[0][0].input;
    expect(prompt).toContain(visualStyle === "webtoon" ? "분야: 진로와 첫 일자리" : "분야: 지역과 봉사");
    expect(prompt).toContain(visualStyle === "webtoon" ? "관계: 신입 구성원과 선배" : "관계: 행사 담당자와 참여자");
    expect(prompt).toContain(visualStyle === "webtoon" ? "장소: 진로 준비 모임" : "장소: 봉사 활동 현장");
    expect(prompt).toContain("갈등: 공동 비용의 분담 기준을 일방적으로 정하는 행동");
    expect(prompt).not.toContain("우선 소재:");
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    for (const [args] of mocks.generate.mock.calls.slice(1)) {
      expect(args.input).toContain(topic);
      expect(args.input).not.toContain("생활 막장");
    }
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
