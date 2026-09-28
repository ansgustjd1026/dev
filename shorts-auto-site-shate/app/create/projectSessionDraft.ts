import type { CaptionEmphasisPoint } from "@/lib/captions/emphasis";
import {
  getSafeVideoVisualStyle,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";

export type CreateStep = 1 | 2 | 3 | 4;
export type ScriptMode = "auto" | "manual";
export type ScriptLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";

export type TimedCaptionDraft = {
  text: string;
  start: number;
  end: number;
};

export type CreateProjectSessionDraft = {
  version: 1;
  savedAt: number;
  projectId: string;
  projectTitle: string;
  currentStep: CreateStep;
  maxReachedStep: CreateStep;
  showAllResults: boolean;
  scriptMode: ScriptMode;
  topic: string;
  scriptDurationSeconds: number;
  language: ScriptLanguage;
  script: string;
  captionEmphasisPoints: CaptionEmphasisPoint[];
  voice: string;
  audioUrl: string;
  audioPath: string;
  audioDuration: number | null;
  backgroundDuration: number | null;
  timedCaptions: TimedCaptionDraft[];
  selectedBackgroundUrl: string;
  selectedBackgroundPath: string;
  videoVisualStyle: VideoVisualStyle;
  backgroundPlaybackSpeed: number;
  isBackgroundSpeedFit: boolean;
  isBackgroundReversed: boolean;
  finalVideoUrl: string;
  finalVideoPath: string;
  sourceVideoName: string;
  sourceVideoPath: string;
  sourceVideoUrl: string;
  sourceVideoDuration: number | null;
  projectStatus: string;
  hasScriptChangedAfterOutputs: boolean;
  stepNotices: Record<CreateStep, string>;
};

const SESSION_DRAFT_VERSION = 1;
const SESSION_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 6;

export function getCreateProjectSessionDraftKey(projectId: string) {
  return `shate:create-project:${projectId || "new"}`;
}

function isCreateStep(value: unknown): value is CreateStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isScriptMode(value: unknown): value is ScriptMode {
  return value === "auto" || value === "manual";
}

function isScriptLanguage(value: unknown): value is ScriptLanguage {
  return (
    value === "ko" ||
    value === "en" ||
    value === "ja" ||
    value === "zh" ||
    value === "es" ||
    value === "fr"
  );
}

function toString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toScriptDurationSeconds(value: unknown, fallbackLength: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(120, Math.max(30, Math.round(value)));
  }

  if (fallbackLength === "short") return 30;
  if (fallbackLength === "long") return 120;

  return 60;
}

function toBackgroundPlaybackSpeed(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(0.5, value));
}

function toTimedCaptions(value: unknown): TimedCaptionDraft[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((caption) => {
      if (!caption || typeof caption !== "object") return null;

      const input = caption as Record<string, unknown>;
      const text = toString(input.text);
      const start = toNullableNumber(input.start);
      const end = toNullableNumber(input.end);

      if (!text || start === null || end === null) return null;

      return { text, start, end };
    })
    .filter((caption): caption is TimedCaptionDraft => Boolean(caption));
}

function toStepNotices(value: unknown): Record<CreateStep, string> {
  const empty: Record<CreateStep, string> = {
    1: "",
    2: "",
    3: "",
    4: "",
  };

  if (!value || typeof value !== "object") return empty;

  const input = value as Record<string, unknown>;

  return {
    1: toString(input[1]),
    2: toString(input[2]),
    3: toString(input[3]),
    4: toString(input[4]),
  };
}

function toCaptionEmphasisPoints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value as CaptionEmphasisPoint[];
}

export function parseCreateProjectSessionDraft(
  value: string | null
): CreateProjectSessionDraft | null {
  if (!value) return null;

  try {
    const input = JSON.parse(value) as Record<string, unknown>;

    if (input.version !== SESSION_DRAFT_VERSION) return null;
    if (typeof input.savedAt !== "number") return null;
    if (Date.now() - input.savedAt > SESSION_DRAFT_MAX_AGE_MS) return null;

    return {
      version: SESSION_DRAFT_VERSION,
      savedAt: input.savedAt,
      projectId: toString(input.projectId),
      projectTitle: toString(input.projectTitle),
      currentStep: isCreateStep(input.currentStep) ? input.currentStep : 1,
      maxReachedStep: isCreateStep(input.maxReachedStep)
        ? input.maxReachedStep
        : 1,
      showAllResults:
        typeof input.showAllResults === "boolean" ? input.showAllResults : false,
      scriptMode: isScriptMode(input.scriptMode) ? input.scriptMode : "auto",
      topic: toString(input.topic),
      scriptDurationSeconds: toScriptDurationSeconds(
        input.scriptDurationSeconds,
        input.length
      ),
      language: isScriptLanguage(input.language) ? input.language : "ko",
      script: toString(input.script),
      captionEmphasisPoints: toCaptionEmphasisPoints(
        input.captionEmphasisPoints
      ),
      voice: toString(input.voice) || "nova",
      audioUrl: toString(input.audioUrl),
      audioPath: toString(input.audioPath),
      audioDuration: toNullableNumber(input.audioDuration),
      backgroundDuration: toNullableNumber(input.backgroundDuration),
      timedCaptions: toTimedCaptions(input.timedCaptions),
      selectedBackgroundUrl: toString(input.selectedBackgroundUrl),
      selectedBackgroundPath: toString(input.selectedBackgroundPath),
      videoVisualStyle: getSafeVideoVisualStyle(input.videoVisualStyle),
      backgroundPlaybackSpeed: toBackgroundPlaybackSpeed(
        input.backgroundPlaybackSpeed
      ),
      isBackgroundSpeedFit:
        typeof input.isBackgroundSpeedFit === "boolean"
          ? input.isBackgroundSpeedFit
          : false,
      isBackgroundReversed:
        typeof input.isBackgroundReversed === "boolean"
          ? input.isBackgroundReversed
          : false,
      finalVideoUrl: toString(input.finalVideoUrl),
      finalVideoPath: toString(input.finalVideoPath),
      sourceVideoName: toString(input.sourceVideoName),
      sourceVideoPath: toString(input.sourceVideoPath),
      sourceVideoUrl: toString(input.sourceVideoUrl),
      sourceVideoDuration: toNullableNumber(input.sourceVideoDuration),
      projectStatus: toString(input.projectStatus) || "draft",
      hasScriptChangedAfterOutputs:
        typeof input.hasScriptChangedAfterOutputs === "boolean"
          ? input.hasScriptChangedAfterOutputs
          : false,
      stepNotices: toStepNotices(input.stepNotices),
    };
  } catch {
    return null;
  }
}

export function loadCreateProjectSessionDraft(projectId: string) {
  if (typeof window === "undefined") return null;

  const key = getCreateProjectSessionDraftKey(projectId);
  const draft = parseCreateProjectSessionDraft(window.sessionStorage.getItem(key));

  if (!draft) {
    window.sessionStorage.removeItem(key);
  }

  return draft;
}

export function clearCreateProjectSessionDraft(projectId: string) {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(getCreateProjectSessionDraftKey(projectId));
}

export function saveCreateProjectSessionDraft(
  projectId: string,
  draft: CreateProjectSessionDraft
) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    getCreateProjectSessionDraftKey(projectId),
    JSON.stringify({
      ...draft,
      version: SESSION_DRAFT_VERSION,
      savedAt: Date.now(),
    })
  );
}
