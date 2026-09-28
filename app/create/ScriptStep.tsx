import type { FormEvent } from "react";
import Button from "@/app/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import Input from "@/app/components/ui/Input";
import Textarea from "@/app/components/ui/Textarea";

type ScriptMode = "auto" | "manual";
type ScriptLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";

type Props = {
  scriptMode: ScriptMode;
  topic: string;
  script: string;
  durationSeconds: number;
  language: ScriptLanguage;
  labels: {
    title: string;
    auto: string;
    manual: string;
    topicLabel: string;
    topicPlaceholder: string;
    languageLabel: string;
    lengthLabel: string;
    generate: string;
    generating: string;
    generated: string;
    manualLabel: string;
    manualPlaceholder: string;
  };
  isGeneratingScript: boolean;
  isScriptGenerated: boolean;
  onScriptModeChange: (mode: ScriptMode) => void;
  onTopicChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onLanguageChange: (value: ScriptLanguage) => void;
  onScriptChange: (value: string) => void;
  onGenerateScript: (event: FormEvent<HTMLFormElement>) => void;
};

const LANGUAGE_OPTIONS: Array<[ScriptLanguage, string]> = [
  ["ko", "한국어"],
  ["en", "English"],
  ["ja", "日本語"],
  ["zh", "中文"],
  ["es", "Español"],
  ["fr", "Français"],
];

const SCRIPT_MAX_LENGTH = 3000;

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes === 0) return `${rest}s`;

  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function optionClass(isActive: boolean) {
  return `rounded-xl border px-4 py-3 font-semibold transition ${
    isActive
      ? "border-slate-950 bg-slate-950 text-slate-50 shadow-sm"
      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-100"
  }`;
}

function compactOptionClass(isActive: boolean) {
  return `rounded-xl px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? "bg-slate-950 text-slate-50 shadow-sm"
      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-100"
  }`;
}

export default function ScriptStep({
  scriptMode,
  topic,
  script,
  durationSeconds,
  language,
  labels,
  isGeneratingScript,
  isScriptGenerated,
  onScriptModeChange,
  onTopicChange,
  onDurationChange,
  onLanguageChange,
  onScriptChange,
  onGenerateScript,
}: Props) {
  const [durationState, setDurationState] = useState({
    source: durationSeconds,
    value: durationSeconds,
  });
  const onDurationChangeRef = useRef(onDurationChange);
  let localDurationSeconds = durationState.value;

  if (durationState.source !== durationSeconds) {
    localDurationSeconds = durationSeconds;
    setDurationState({
      source: durationSeconds,
      value: durationSeconds,
    });
  }

  const durationPercent = ((localDurationSeconds - 30) / (120 - 30)) * 100;

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    if (localDurationSeconds === durationSeconds) return;

    const timeoutId = window.setTimeout(() => {
      onDurationChangeRef.current(localDurationSeconds);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationSeconds, localDurationSeconds]);

  return (
    <div className="w-full shrink-0">
      <div className="rounded-2xl border border-slate-300 bg-white p-5">
        <h2 className="text-2xl font-semibold text-slate-950">{labels.title}</h2>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onScriptModeChange("auto")}
            className={optionClass(scriptMode === "auto")}
          >
            {labels.auto}
          </button>

          <button
            type="button"
            onClick={() => onScriptModeChange("manual")}
            className={optionClass(scriptMode === "manual")}
          >
            {labels.manual}
          </button>
        </div>
      </div>

      {scriptMode === "auto" ? (
        <form
          onSubmit={onGenerateScript}
          className="mt-5 rounded-2xl border border-slate-300 bg-white p-5"
        >
          <label className="block text-sm font-semibold text-slate-800">
            {labels.topicLabel}
          </label>

          <Input
            type="text"
            placeholder={labels.topicPlaceholder}
            className="mt-3"
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
          />

          <div className="mt-6">
            <label className="block text-sm font-semibold text-slate-800">
              {labels.languageLabel}
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onLanguageChange(value)}
                  className={`${compactOptionClass(language === value)} shrink-0`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-slate-800">
                {labels.lengthLabel}
              </label>
              <span className="rounded-full border border-slate-950 bg-slate-950 px-3 py-1 text-sm font-bold text-slate-50">
                {formatDuration(localDurationSeconds)}
              </span>
            </div>

            <div className="mt-4">
              <input
                aria-label={`${labels.lengthLabel}: ${formatDuration(localDurationSeconds)}`}
                type="range"
                min={30}
                max={120}
                step={5}
                value={localDurationSeconds}
                disabled={isGeneratingScript}
                onChange={(event) =>
                  setDurationState({
                    source: durationSeconds,
                    value: Number(event.target.value),
                  })
                }
                style={{
                  background: `linear-gradient(to right, rgb(15 23 42) 0%, rgb(15 23 42) ${durationPercent}%, rgb(203 213 225) ${durationPercent}%, rgb(203 213 225) 100%)`,
                }}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-45 [--thumb-size:18px] [&::-moz-range-thumb]:h-[var(--thumb-size)] [&::-moz-range-thumb]:w-[var(--thumb-size)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-slate-950 [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(15,23,42,0.12)] [&::-webkit-slider-thumb]:h-[var(--thumb-size)] [&::-webkit-slider-thumb]:w-[var(--thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-950 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(15,23,42,0.12)]"
              />

              <div className="mt-3 flex justify-between text-xs font-medium text-neutral-500">
                <span>0:30</span>
                <span>2:00</span>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isGeneratingScript || isScriptGenerated}
            fullWidth
            className="mt-8"
          >
            {isGeneratingScript
              ? labels.generating
              : isScriptGenerated
                ? labels.generated
                : labels.generate}
          </Button>
        </form>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-300 bg-white p-5">
          <label className="block text-sm font-semibold text-slate-800">
            {labels.manualLabel}
          </label>

          <Textarea
            className="mt-3 min-h-72"
            maxLength={SCRIPT_MAX_LENGTH}
            value={script}
            onChange={(event) => onScriptChange(event.target.value)}
            placeholder={labels.manualPlaceholder}
          />
        </div>
      )}
    </div>
  );
}

