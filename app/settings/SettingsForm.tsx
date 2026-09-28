"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InlineStatus from "@/app/components/ui/InlineStatus";
import type { SiteLocale } from "@/lib/i18n/config";
import type {
  DefaultAutoVisualMode,
  DefaultBackgroundDirection,
  DefaultBackgroundPlaybackSpeed,
  DefaultScriptLanguage,
  DefaultVoice,
  DefaultYouTubePrivacy,
  SiteTheme,
  UserPreferences,
} from "@/lib/preferences/config";
import { VIDEO_VISUAL_STYLE_OPTIONS } from "@/lib/visuals/styles";

type Props = {
  initialPreferences: UserPreferences;
};

type Option<T extends string> = { value: T; ko: string; en: string };

const LANGUAGE_OPTIONS: Option<SiteLocale>[] = [
  { value: "ko", ko: "한국어", en: "Korean" },
  { value: "en", ko: "English", en: "English" },
];
const THEME_OPTIONS: Option<SiteTheme>[] = [
  { value: "light", ko: "라이트", en: "Light" },
  { value: "dark", ko: "다크", en: "Dark" },
  { value: "system", ko: "시스템", en: "System" },
];
const SCRIPT_LANGUAGE_OPTIONS: Option<DefaultScriptLanguage>[] = [
  { value: "ko", ko: "한국어", en: "Korean" },
  { value: "en", ko: "영어", en: "English" },
  { value: "ja", ko: "일본어", en: "Japanese" },
  { value: "zh", ko: "중국어", en: "Chinese" },
  { value: "es", ko: "스페인어", en: "Spanish" },
  { value: "fr", ko: "프랑스어", en: "French" },
];
const PRIVACY_OPTIONS: Option<DefaultYouTubePrivacy>[] = [
  { value: "public", ko: "공개", en: "Public" },
  { value: "unlisted", ko: "일부 공개", en: "Unlisted" },
  { value: "private", ko: "비공개", en: "Private" },
];
const VISUAL_OPTIONS: Option<DefaultAutoVisualMode>[] = [
  { value: "images", ko: "자동 생성", en: "Auto generation" },
  { value: "background", ko: "내 배경 랜덤", en: "Random background" },
];
const VOICE_OPTIONS: Option<DefaultVoice>[] = [
  { value: "random", ko: "자동", en: "Auto" },
  { value: "nova", ko: "Nova", en: "Nova" },
  { value: "shimmer", ko: "Shimmer", en: "Shimmer" },
  { value: "echo", ko: "Echo", en: "Echo" },
  { value: "onyx", ko: "Onyx", en: "Onyx" },
  { value: "fable", ko: "Fable", en: "Fable" },
  { value: "alloy", ko: "Alloy", en: "Alloy" },
];
const BACKGROUND_SPEED_OPTIONS: Option<DefaultBackgroundPlaybackSpeed>[] = [
  { value: "fit", ko: "길이 맞춤", en: "Fit" },
  { value: "0.5", ko: "0.5x", en: "0.5x" },
  { value: "1", ko: "1x", en: "1x" },
  { value: "1.5", ko: "1.5x", en: "1.5x" },
  { value: "2", ko: "2x", en: "2x" },
  { value: "3", ko: "3x", en: "3x" },
  { value: "4", ko: "4x", en: "4x" },
  { value: "5", ko: "5x", en: "5x" },
];
const BACKGROUND_DIRECTION_OPTIONS: Option<DefaultBackgroundDirection>[] = [
  { value: "forward", ko: "정방향", en: "Forward" },
  { value: "reverse", ko: "역재생", en: "Reverse" },
];

function applyTheme(theme: SiteTheme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  document.documentElement.dataset.themeSetting = theme;
  document.documentElement.dataset.theme = resolved;
}

function SettingGroup<T extends string>({
  title,
  value,
  options,
  locale,
  onChange,
  disabled = false,
}: {
  title: string;
  value: T;
  options: Option<T>[];
  locale: SiteLocale;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-b border-slate-200 py-5 last:border-b-0">
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                className={`min-h-10 rounded-lg border px-4 text-sm font-semibold transition ${
                  disabled
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70"
                    : selected
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                }`}
              >
                {locale === "ko" ? option.ko : option.en}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DurationSetting({
  value,
  locale,
  onChange,
}: {
  value: number;
  locale: SiteLocale;
  onChange: (value: number) => void;
}) {
  const title = locale === "ko" ? "대본 길이" : "Script duration";

  return (
    <div className="border-b border-slate-200 py-5">
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <div className="flex items-center gap-4">
          <input
            aria-label={title}
            className="h-2 w-full cursor-pointer accent-slate-950"
            max={120}
            min={30}
            onChange={(event) => onChange(Number(event.target.value))}
            step={5}
            type="range"
            value={value}
          />
          <output className="min-w-14 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-center text-sm font-bold text-slate-800">
            {locale === "ko" ? `${value}초` : `${value}s`}
          </output>
        </div>
      </div>
    </div>
  );
}

export default function SettingsForm({ initialPreferences }: Props) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [appliedPreferences, setAppliedPreferences] = useState(initialPreferences);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const displayLocale = appliedPreferences.locale;
  const isKorean = displayLocale === "ko";

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    const response = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    setAppliedPreferences(preferences);
    applyTheme(preferences.theme);
    setStatus("saved");
    router.replace("/profile?tab=settings", { scroll: false });
  }

  return (
    <div>
      <section aria-labelledby="general-settings-title">
        <h2
          id="general-settings-title"
          className="text-xl font-bold text-slate-950"
        >
          {isKorean ? "일반" : "General"}
        </h2>
        <div className="mt-2">
          <SettingGroup
            title={isKorean ? "사이트 언어" : "Site language"}
            value={preferences.locale}
            options={LANGUAGE_OPTIONS}
            locale={displayLocale}
            onChange={(value) => update("locale", value)}
          />
          <SettingGroup
            title={isKorean ? "화면 모드" : "Appearance"}
            value={preferences.theme}
            options={THEME_OPTIONS}
            locale={displayLocale}
            onChange={(value) => update("theme", value)}
          />
        </div>
      </section>

      <section
        aria-labelledby="automation-settings-title"
        className="mt-8 border-t border-slate-300 pt-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="automation-settings-title"
              className="text-xl font-bold text-slate-950"
            >
              {isKorean ? "자동 제작" : "Auto-create"}
            </h2>
          </div>
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            PRO
          </span>
        </div>
        <div className="mt-2">
          <SettingGroup
            title={isKorean ? "대본 언어" : "Script language"}
            value={preferences.scriptLanguage}
            options={SCRIPT_LANGUAGE_OPTIONS}
            locale={displayLocale}
            onChange={(value) => update("scriptLanguage", value)}
          />
          <DurationSetting
            value={preferences.scriptDurationSeconds}
            locale={displayLocale}
            onChange={(value) => update("scriptDurationSeconds", value)}
          />
          <SettingGroup
            title={isKorean ? "기본 음성" : "Default voice"}
            value={preferences.voice}
            options={VOICE_OPTIONS}
            locale={displayLocale}
            onChange={(value) => update("voice", value)}
          />
          <SettingGroup
            title={isKorean ? "영상 방식" : "Visual source"}
            value={preferences.autoVisualMode}
            options={VISUAL_OPTIONS}
            locale={displayLocale}
            onChange={(value) => update("autoVisualMode", value)}
          />
          {preferences.autoVisualMode === "images" ? (
            <SettingGroup
              title={isKorean ? "자동 생성 스타일" : "Generation style"}
              value={preferences.videoVisualStyle}
              options={VIDEO_VISUAL_STYLE_OPTIONS}
              locale={displayLocale}
              onChange={(value) => update("videoVisualStyle", value)}
            />
          ) : (
            <>
              <SettingGroup
                title={isKorean ? "배경 배속" : "Background speed"}
                value={preferences.backgroundPlaybackSpeed}
                options={BACKGROUND_SPEED_OPTIONS}
                locale={displayLocale}
                onChange={(value) => update("backgroundPlaybackSpeed", value)}
              />
              <SettingGroup
                title={isKorean ? "배경 재생 방향" : "Background direction"}
                value={preferences.backgroundDirection}
                options={BACKGROUND_DIRECTION_OPTIONS}
                locale={displayLocale}
                onChange={(value) => update("backgroundDirection", value)}
              />
            </>
          )}
          <SettingGroup
            title={isKorean ? "YouTube 공개 범위" : "YouTube visibility"}
            value={preferences.youtubePrivacy}
            options={PRIVACY_OPTIONS}
            locale={displayLocale}
            onChange={(value) => update("youtubePrivacy", value)}
          />
          <div className="border-b border-slate-200 py-5">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {isKorean ? "게시 후 댓글" : "Post-upload comment"}
                </h2>
              </div>
              <label className="grid gap-1.5">
                <textarea
                  value={preferences.youtubePinnedComment}
                  onChange={(event) => update("youtubePinnedComment", event.target.value.slice(0, 10_000))}
                  rows={4}
                  maxLength={10_000}
                  className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                />
                <span className="text-right text-[11px] text-slate-500">
                  {preferences.youtubePinnedComment.length}/10000
                </span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 flex items-center justify-end gap-3">
        {status === "saved" ? <InlineStatus tone="success">{isKorean ? "저장됨" : "Saved"}</InlineStatus> : null}
        {status === "error" ? <InlineStatus tone="error">{isKorean ? "저장 실패" : "Could not save"}</InlineStatus> : null}
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="app-primary min-h-11 rounded-lg border border-slate-950 bg-slate-950 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "saving" ? (isKorean ? "저장 중" : "Saving") : isKorean ? "저장" : "Save"}
        </button>
      </div>
    </div>
  );
}
