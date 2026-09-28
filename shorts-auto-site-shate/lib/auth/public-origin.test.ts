import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicOrigin } from "./public-origin";

describe("OAuth public origin", () => {
  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/api/youtube/callback", "/api/toss/youtube/callback"])(
    "uses the same public URI for authorization and token exchange: %s",
    (path) => {
      vi.stubEnv("RENDER_EXTERNAL_URL", "https://shate-37cj.onrender.com");
      const internal = new Request("https://localhost:10000/api/youtube/connect");
      const callback = new Request(`http://localhost:10000${path}?code=test&state=test`);
      const expected = `https://shate-37cj.onrender.com${path}`;
      expect(new URL(path, getPublicOrigin(internal)).toString()).toBe(expected);
      expect(new URL(path, getPublicOrigin(callback)).toString()).toBe(expected);
    },
  );

  it("prefers a configured custom domain and ignores untrusted forwarded headers", () => {
    vi.stubEnv("APP_BASE_URL", " https://shate.example.com/ ");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://shate-37cj.onrender.com");
    const request = new Request("http://localhost:10000", {
      headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" },
    });
    expect(getPublicOrigin(request)).toBe("https://shate.example.com");
  });

  it("preserves local development ports without deployment configuration", () => {
    expect(getPublicOrigin(new Request("http://localhost:3000/api/youtube/connect")))
      .toBe("http://localhost:3000");
  });

  it.each(["javascript:alert(1)", "https://user:password@example.com", "not-a-url"])(
    "rejects invalid configured origins instead of silently using localhost: %s",
    (value) => {
      vi.stubEnv("APP_BASE_URL", value);
      expect(() => getPublicOrigin(new Request("http://localhost:10000"))).toThrow();
    },
  );
});
