import type { SiteLocale } from "@/lib/i18n/config";
import {
  getSafeVideoVisualStyle,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";

export { getSafeVideoVisualStyle };
export type { VideoVisualStyle };

export type SiteTheme = "light" | "dark" | "system";
export type DefaultScriptLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";
export type DefaultVoice = "random" | "nova" | "shimmer" | "echo" | "onyx" | "fable" | "alloy";
export type DefaultYouTubePrivacy = "public" | "unlisted" | "private";
export type DefaultAutoVisualMode = "background" | "images";
export type DefaultBackgroundPlaybackSpeed = "fit" | "0.5" | "1" | "1.5" | "2" | "3" | "4" | "5";
export type DefaultBackgroundDirection = "forward" | "reverse";

export type UserPreferences = {
  locale: SiteLocale;
  theme: SiteTheme;
  scriptLanguage: DefaultScriptLanguage;
  scriptDurationSeconds: number;
  voice: DefaultVoice;
  autoVisualMode: DefaultAutoVisualMode;
  videoVisualStyle: VideoVisualStyle;
  backgroundPlaybackSpeed: DefaultBackgroundPlaybackSpeed;
  backgroundDirection: DefaultBackgroundDirection;
  youtubePrivacy: DefaultYouTubePrivacy;
  youtubePinnedComment: string;
};

export const PREFERENCE_COOKIES = {
  theme: "site_theme",
  scriptLanguage: "default_script_language",
  scriptDurationSeconds: "default_script_duration_seconds",
  voice: "default_voice",
  videoVisualStyle: "default_video_visual_style",
  backgroundPlaybackSpeed: "default_background_playback_speed",
  backgroundDirection: "default_background_direction",
  youtubePrivacy: "default_youtube_privacy",
  youtubePinnedComment: "default_youtube_pinned_comment",
  autoVisualMode: "default_auto_visual_mode",
} as const;

export function getSafeTheme(value: unknown): SiteTheme {
  return value === "light" || value === "dark" ? value : "system";
}

export function getSafeScriptLanguage(value: unknown): DefaultScriptLanguage {
  return value === "en" || value === "ja" || value === "zh" || value === "es" || value === "fr"
    ? value
    : "ko";
}

export function getSafeScriptDurationSeconds(value: unknown) {
  const duration = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(duration)) return 60;
  return Math.min(120, Math.max(30, Math.round(duration / 5) * 5));
}

export function getSafeDefaultVoice(value: unknown): DefaultVoice {
  return value === "nova" ||
    value === "shimmer" ||
    value === "echo" ||
    value === "onyx" ||
    value === "fable" ||
    value === "alloy"
    ? value
    : "random";
}

export function getSafeYouTubePrivacy(value: unknown): DefaultYouTubePrivacy {
  return value === "unlisted" || value === "private" ? value : "public";
}

export function getSafeYouTubePinnedComment(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10_000) : "";
}

export function getSafeAutoVisualMode(value: unknown): DefaultAutoVisualMode {
  return value === "background" ? "background" : "images";
}

export function getSafeBackgroundPlaybackSpeed(
  value: unknown
): DefaultBackgroundPlaybackSpeed {
  return value === "0.5" ||
    value === "1" ||
    value === "1.5" ||
    value === "2" ||
    value === "3" ||
    value === "4" ||
    value === "5"
    ? value
    : "fit";
}

export function getSafeBackgroundDirection(
  value: unknown
): DefaultBackgroundDirection {
  return value === "reverse" ? "reverse" : "forward";
}
