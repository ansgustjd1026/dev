import { NextResponse } from "next/server";
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
} from "@/lib/preferences/config";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { getRequestLimitResponse, readJsonBody } from "@/lib/security/api-limits";

const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApiUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await readJsonBody(request, 2048)) as Record<string, unknown>;
    const preferences = {
      locale: getSafeSiteLocale(body.locale),
      theme: getSafeTheme(body.theme),
      scriptLanguage: getSafeScriptLanguage(body.scriptLanguage),
      scriptDurationSeconds: getSafeScriptDurationSeconds(body.scriptDurationSeconds),
      voice: getSafeDefaultVoice(body.voice),
      autoVisualMode: getSafeAutoVisualMode(body.autoVisualMode),
      videoVisualStyle: getSafeVideoVisualStyle(body.videoVisualStyle),
      backgroundPlaybackSpeed: getSafeBackgroundPlaybackSpeed(
        body.backgroundPlaybackSpeed
      ),
      backgroundDirection: getSafeBackgroundDirection(body.backgroundDirection),
      youtubePrivacy: getSafeYouTubePrivacy(body.youtubePrivacy),
      youtubePinnedComment: getSafeYouTubePinnedComment(body.youtubePinnedComment),
    };
    const response = NextResponse.json(preferences);

    response.cookies.set(SITE_LOCALE_COOKIE, preferences.locale, COOKIE_OPTIONS);
    response.cookies.set(PREFERENCE_COOKIES.theme, preferences.theme, COOKIE_OPTIONS);
    response.cookies.set(
      PREFERENCE_COOKIES.scriptLanguage,
      preferences.scriptLanguage,
      COOKIE_OPTIONS
    );
    response.cookies.set(
      PREFERENCE_COOKIES.scriptDurationSeconds,
      String(preferences.scriptDurationSeconds),
      COOKIE_OPTIONS
    );
    response.cookies.set(PREFERENCE_COOKIES.voice, preferences.voice, COOKIE_OPTIONS);
    response.cookies.set(
      PREFERENCE_COOKIES.autoVisualMode,
      preferences.autoVisualMode,
      COOKIE_OPTIONS
    );
    response.cookies.set(
      PREFERENCE_COOKIES.videoVisualStyle,
      preferences.videoVisualStyle,
      COOKIE_OPTIONS
    );
    response.cookies.set(
      PREFERENCE_COOKIES.backgroundPlaybackSpeed,
      preferences.backgroundPlaybackSpeed,
      COOKIE_OPTIONS
    );
    response.cookies.set(
      PREFERENCE_COOKIES.backgroundDirection,
      preferences.backgroundDirection,
      COOKIE_OPTIONS
    );
    response.cookies.set(
      PREFERENCE_COOKIES.youtubePrivacy,
      preferences.youtubePrivacy,
      COOKIE_OPTIONS
    );
    response.cookies.set(
      PREFERENCE_COOKIES.youtubePinnedComment,
      preferences.youtubePinnedComment,
      COOKIE_OPTIONS
    );

    return response;
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    return NextResponse.json(
      { error: "설정을 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
