import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAllowedYouTubeVideoUrl } from "./video-url";

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

describe("isAllowedYouTubeVideoUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  });

  it("accepts the current user's final video", () => {
    expect(
      isAllowedYouTubeVideoUrl(
        "https://example.supabase.co/storage/v1/object/public/final-videos/user-1/project-1/final.mp4",
        "user-1"
      )
    ).toBe(true);
  });

  it("rejects another user's final video", () => {
    expect(
      isAllowedYouTubeVideoUrl(
        "https://example.supabase.co/storage/v1/object/public/final-videos/user-2/project-1/final.mp4",
        "user-1"
      )
    ).toBe(false);
  });

  it("rejects external and non-HTTPS URLs", () => {
    expect(
      isAllowedYouTubeVideoUrl(
        "https://attacker.example/final-videos/user-1/final.mp4",
        "user-1"
      )
    ).toBe(false);
    expect(
      isAllowedYouTubeVideoUrl(
        "http://example.supabase.co/storage/v1/object/public/final-videos/user-1/final.mp4",
        "user-1"
      )
    ).toBe(false);
  });
});
