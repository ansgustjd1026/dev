import { describe, expect, it } from "vitest";
import {
  RequestLimitError,
  enforceRateLimit,
  isStringWithinLimit,
  readJsonBody,
} from "./api-limits";

describe("isStringWithinLimit", () => {
  it("accepts non-empty strings within the limit", () => {
    expect(isStringWithinLimit("hello", 5)).toBe(true);
  });

  it("rejects empty strings unless explicitly allowed", () => {
    expect(isStringWithinLimit("", 5)).toBe(false);
    expect(isStringWithinLimit("   ", 5)).toBe(false);
    expect(isStringWithinLimit("", 5, true)).toBe(true);
  });

  it("rejects non-strings and strings over the limit", () => {
    expect(isStringWithinLimit(123, 5)).toBe(false);
    expect(isStringWithinLimit("hello!", 5)).toBe(false);
  });
});

describe("readJsonBody", () => {
  it("parses a JSON request body", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody(request, 1024)).resolves.toEqual({ ok: true });
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{",
    });

    await expect(readJsonBody(request, 1024)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects bodies larger than the byte limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ value: "too long" }),
    });

    await expect(readJsonBody(request, 8)).rejects.toBeInstanceOf(
      RequestLimitError
    );
  });
});

describe("enforceRateLimit", () => {
  it("allows requests below the configured limit", () => {
    const key = `test-allow-${Date.now()}`;

    expect(enforceRateLimit({ key, limit: 2, windowMs: 60_000 })).toBeNull();
    expect(enforceRateLimit({ key, limit: 2, windowMs: 60_000 })).toBeNull();
  });

  it("returns a 429 response after the limit is reached", () => {
    const key = `test-block-${Date.now()}`;

    expect(enforceRateLimit({ key, limit: 1, windowMs: 60_000 })).toBeNull();

    const response = enforceRateLimit({ key, limit: 1, windowMs: 60_000 });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
  });
});
