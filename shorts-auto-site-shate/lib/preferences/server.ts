import { cookies } from "next/headers";
import { SITE_LOCALE_COOKIE, getSafeSiteLocale } from "@/lib/i18n/config";
import {
  PREFERENCE_COOKIES,
  getSafeAutoVisualMode,
  getSafeBackgroundDirection,
  getSafeBackgroundPlaybackSpeed,
  getSafeDefaultVoice,
  getSafeScriptDurationSeconds,
  getSafeScriptLanguage,
  getSafeTheme,
  getSafeVideoVisualStyle,
  getSafeYouTubePinnedComment,
  getSafeYouTubePrivacy,
  type UserPreferences,
} from "./config";

export async function getUserPreferences(): Promise<UserPreferences> {
  const cookieStore = await cookies();

  return {
    locale: getSafeSiteLocale(cookieStore.get(SITE_LOCALE_COOKIE)?.value),
    theme: getSafeTheme(cookieStore.get(PREFERENCE_COOKIES.theme)?.value),
    scriptLanguage: getSafeScriptLanguage(
      cookieStore.get(PREFERENCE_COOKIES.scriptLanguage)?.value
    ),
    scriptDurationSeconds: getSafeScriptDurationSeconds(
      cookieStore.get(PREFERENCE_COOKIES.scriptDurationSeconds)?.value
    ),
    voice: getSafeDefaultVoice(cookieStore.get(PREFERENCE_COOKIES.voice)?.value),
    autoVisualMode: getSafeAutoVisualMode(
      cookieStore.get(PREFERENCE_COOKIES.autoVisualMode)?.value
    ),
    videoVisualStyle: getSafeVideoVisualStyle(
      cookieStore.get(PREFERENCE_COOKIES.videoVisualStyle)?.value
    ),
    backgroundPlaybackSpeed: getSafeBackgroundPlaybackSpeed(
      cookieStore.get(PREFERENCE_COOKIES.backgroundPlaybackSpeed)?.value
    ),
    backgroundDirection: getSafeBackgroundDirection(
      cookieStore.get(PREFERENCE_COOKIES.backgroundDirection)?.value
    ),
    youtubePrivacy: getSafeYouTubePrivacy(
      cookieStore.get(PREFERENCE_COOKIES.youtubePrivacy)?.value
    ),
    youtubePinnedComment: getSafeYouTubePinnedComment(
      cookieStore.get(PREFERENCE_COOKIES.youtubePinnedComment)?.value
    ),
  };
}
