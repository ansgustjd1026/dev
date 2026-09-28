import type { AppPreferences } from "./types";

const STORAGE_KEY = "shate:toss:preferences:v1";

export const DEFAULT_PREFERENCES: AppPreferences = {
  language: "ko",
  durationSeconds: 60,
  voice: "random",
  visualStyle: "cinematic",
  youtubePrivacy: "public",
  pinnedComment: "",
};

export function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<AppPreferences> | null;
    return stored ? { ...DEFAULT_PREFERENCES, ...stored } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: AppPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
