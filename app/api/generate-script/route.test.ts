import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  admin: vi.fn(() => { throw new Error("Script generation must not query channel history"); }),
}));

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
    expect(mocks.generate).toHaveBeenCalledTimes(expand ? 2 : 1);
    for (const [args] of mocks.generate.mock.calls) {
      expect(args.input).toContain(topic);
      expect(args.input).toContain("10~20대");
      expect(args.input).toContain("사용자가 직접 입력한 주제");
      expect(args.input).not.toMatch(/채널 분석|최근 채널 영상|시청자 참고 정보/);
    }
  });
});
