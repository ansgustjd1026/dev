import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/auth/api-user", () => ({
  getAuthenticatedApiUser: vi.fn(async () => ({ id: "youtube-test-user" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "toss_youtube_oauth_states") throw new Error("Unexpected table");
      return { insert: mocks.insert };
    },
  }),
}));

import { GET as connectWeb } from "./route";
import { GET as connectToss } from "../../toss/youtube/connect-url/route";

describe("YouTube permissions without history analysis", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("APP_BASE_URL", "https://shate.example.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["web", "toss"])("keeps uploading and public callbacks for %s", async (platform) => {
    const request = new Request("https://localhost:10000/api/youtube/connect");
    const response = await (platform === "web" ? connectWeb(request) : connectToss(request));
    const authUrl = new URL(platform === "web" ? response.headers.get("location")! : (await response.json()).url);
    const scopes = authUrl.searchParams.get("scope")!.split(" ");

    expect(scopes).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(scopes).toContain("https://www.googleapis.com/auth/youtube.readonly");
    expect(scopes.some((scope) => scope.includes("analytics"))).toBe(false);
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      `https://shate.example.com/api/${platform === "toss" ? "toss/" : ""}youtube/callback`,
    );
    expect(authUrl.searchParams.get("state")).toBeTruthy();
    if (platform === "web") expect(response.headers.get("set-cookie")).toContain("youtube_oauth_state=");
  });
});
