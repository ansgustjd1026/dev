"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/app/components/AppHeader";
import Input from "@/app/components/ui/Input";
import CreateStepHeader from "./CreateStepHeader";
import DeferredResultPreviewPanel from "./DeferredResultPreviewPanel";
import ScriptStep from "./ScriptStep";
import SourceVideoReferenceCard from "./SourceVideoReferenceCard";
import StepProgress from "./StepProgress";
import type { CaptionEffect } from "@/lib/captions/effects";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";
import { addClientNotification } from "@/lib/notifications/client";
import type { DefaultVoice } from "@/lib/preferences/config";
import {
  getSafeVideoVisualStyle,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";
import {
  createCaptionEmphasisPoint,
  normalizeCaptionEmphasisPoints,
  type CaptionEmphasisPoint,
} from "@/lib/captions/emphasis";
import {
  clearCreateProjectSessionDraft,
  loadCreateProjectSessionDraft,
  saveCreateProjectSessionDraft,
  type CreateProjectSessionDraft,
  type ScriptLanguage,
} from "./projectSessionDraft";

function StepPanelLoading() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="h-5 w-36 rounded bg-slate-200" />
      <div className="mt-4 h-28 rounded-lg bg-slate-100" />
    </div>
  );
}

const VoiceStep = dynamic(() => import("./VoiceStep"), {
  loading: StepPanelLoading,
});
const BackgroundStep = dynamic(() => import("./BackgroundStep"), {
  loading: StepPanelLoading,
});
const FinalStep = dynamic(() => import("./FinalStep"), {
  loading: StepPanelLoading,
});

type TimedCaption = {
  text: string;
  start: number;
  end: number;
};

type BackgroundVideo = {
  name: string;
  path: string;
  url: string;
  size?: number;
};

type Step = 1 | 2 | 3 | 4;
type AutoStage =
  | "idle"
  | "background"
  | "script"
  | "script-running"
  | "voice"
  | "voice-running"
  | "render"
  | "rendering"
  | "finalize"
  | "finalizing"
  | "publish"
  | "publishing"
  | "done"
  | "error";

type ManualGeneration = {
  key: "script" | "voice" | "captions" | "video";
  step: Step;
  label: string;
  initialProgress: number;
  increment: number;
};

type CleanupScope = "audio" | "final" | "all";

type GeneratedFileBucket = "tts-audio" | "final-videos";
type StorageBucket = GeneratedFileBucket | "background-videos" | "source-videos";

type ProjectSavePayload = {
  projectId?: string | null;
  title?: string | null;
  topic?: string | null;
  script?: string | null;
  voice?: string | null;
  audio_path?: string | null;
  audio_url?: string | null;
  audio_duration?: number | null;
  background_path?: string | null;
  background_url?: string | null;
  background_duration?: number | null;
  final_video_path?: string | null;
  final_video_url?: string | null;
  final_video_size?: number | null;
  timed_captions?: TimedCaption[] | null;
  caption_emphasis?: CaptionEmphasisPoint[] | null;
  visual_mode?: "background" | "images";
  visual_style?: VideoVisualStyle;
  status?: string;
};

type ProjectRow = {
  id: string;
  title: string | null;
  topic: string | null;
  script: string | null;
  voice: string | null;
  audio_path: string | null;
  audio_url: string | null;
  audio_duration: number | null;
  background_path: string | null;
  background_url: string | null;
  background_duration: number | null;
  final_video_path: string | null;
  final_video_url: string | null;
  final_video_size?: number | null;
  source_video_name?: string | null;
  source_video_path?: string | null;
  source_video_url?: string | null;
  source_video_duration?: number | null;
  timed_captions: TimedCaption[] | null;
  caption_emphasis: unknown;
  visual_mode?: "background" | "images" | null;
  visual_style?: VideoVisualStyle | null;
  status: string;
};

type Props = {
  initialProjectId?: string;
  initialLocale?: SiteLocale;
  initialYouTubeChannelTitle?: string;
  initialIsYouTubeConnected?: boolean;
  initialCanPublishToYouTube?: boolean;
  initialCanRunAutomation?: boolean;
  initialStartProAutomation?: boolean;
  initialScriptLanguage?: ScriptLanguage;
  initialScriptDurationSeconds?: number;
  initialVoice?: Exclude<DefaultVoice, "random">;
  initialAutoVoice?: DefaultVoice;
  initialBackgroundPlaybackSpeed?: number;
  initialBackgroundSpeedFit?: boolean;
  initialBackgroundReversed?: boolean;
  initialYouTubePrivacy?: "private" | "unlisted" | "public";
  initialYouTubePinnedComment?: string;
  initialYouTubePublishEvent?: { id: string; status: string } | null;
  initialAutoVisualMode?: "background" | "images";
  initialVideoVisualStyle?: VideoVisualStyle;
  initialAutomationTopic?: string;
  headless?: boolean;
  enableGlobalAutomation?: boolean;
};

const PROJECT_SELECT_COLUMNS =
  "id, title, topic, script, voice, audio_path, audio_url, audio_duration, background_path, background_url, background_duration, final_video_path, final_video_url, final_video_size, source_video_name, source_video_path, source_video_url, source_video_duration, timed_captions, caption_emphasis, visual_mode, visual_style, status";

const PROJECT_SELECT_COLUMNS_WITHOUT_OPTIONAL_COLUMNS =
  "id, title, topic, script, voice, audio_path, audio_url, audio_duration, background_path, background_url, background_duration, final_video_path, final_video_url, timed_captions, status";
const SCRIPT_MAX_LENGTH = 3000;
const AUTOMATION_VOICES = ["nova", "shimmer", "echo", "onyx", "fable", "alloy"] as const;

function isMissingOptionalProjectColumnMessage(message: string) {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("caption_emphasis") ||
    lowerMessage.includes("source_video") ||
    lowerMessage.includes("column")
  );
}

function createFileToken() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

async function readJsonResponse(response: Response): Promise<{
  data: Record<string, unknown> | null;
  parseError: boolean;
}> {
  const body = await response.text();
  if (!body.trim()) {
    return { data: null, parseError: true };
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    return {
      data:
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null,
      parseError: false,
    };
  } catch {
    return { data: null, parseError: true };
  }
}

async function ensureStorageBucket(bucket: StorageBucket) {
  const response = await fetch("/api/storage/ensure-bucket", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucket }),
  });
  const { data } = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Storage bucket could not be prepared."
    );
  }
}

export default function CreateProjectForm({
  initialProjectId = "",
  initialLocale = "ko",
  initialYouTubeChannelTitle = "",
  initialIsYouTubeConnected = false,
  initialCanPublishToYouTube = false,
  initialCanRunAutomation = false,
  initialStartProAutomation = false,
  initialScriptLanguage = "ko",
  initialScriptDurationSeconds = 60,
  initialVoice = "nova",
  initialAutoVoice = "random",
  initialBackgroundPlaybackSpeed = 1,
  initialBackgroundSpeedFit = false,
  initialBackgroundReversed = false,
  initialYouTubePrivacy = "public",
  initialYouTubePinnedComment = "",
  initialYouTubePublishEvent = null,
  initialAutoVisualMode = "images",
  initialVideoVisualStyle = "cinematic",
  initialAutomationTopic = "",
  headless = false,
  enableGlobalAutomation = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const siteText = getSiteText(initialLocale);
  const textFor = useCallback(
    (ko: string, en: string) => (initialLocale === "ko" ? ko : en),
    [initialLocale]
  );
  const projectIdRef = useRef(initialProjectId);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cleanupQueueRef = useRef<Promise<void>>(Promise.resolve());
  const scriptOutputsInvalidatedRef = useRef(false);
  const scriptCleanupPromiseRef = useRef<Promise<void> | null>(null);
  const scriptSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const scriptSaveAbortRef = useRef<AbortController | null>(null);
  const restoredSessionDraftRef = useRef(false);
  const stepNavigationLockRef = useRef(false);
  const autoRunRef = useRef(false);
  const requestedAutoRunRef = useRef(false);

  const [projectId, setProjectId] = useState(initialProjectId);
  const [projectTitle, setProjectTitle] = useState("");
  const [isLoadingProject, setIsLoadingProject] = useState(
    Boolean(initialProjectId)
  );
  const [, setIsSavingAndLeaving] = useState(false);

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<Step>(1);
  const [nextStepRevealToken, setNextStepRevealToken] = useState(0);
  const [showAllResults, setShowAllResults] = useState(false);
  const [isStepNavigating, setIsStepNavigating] = useState(false);

  const [scriptMode, setScriptMode] = useState<"auto" | "manual">("auto");

  const [topic, setTopic] = useState("");
  const [scriptDurationSeconds, setScriptDurationSeconds] = useState(initialScriptDurationSeconds);
  const [language, setLanguage] = useState<ScriptLanguage>(initialScriptLanguage);

  const [script, setScript] = useState("");
  const [captionEmphasisPoints, setCaptionEmphasisPoints] = useState<
    CaptionEmphasisPoint[]
  >([]);
  const [voice, setVoice] = useState<string>(initialVoice);

  const [stepNotices, setStepNotices] = useState<Record<Step, string>>({
    1: "",
    2: "",
    3: "",
    4: "",
  });

  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [isAnalyzingCaptionEmphasis, setIsAnalyzingCaptionEmphasis] =
    useState(false);
  const [manualGenerationProgress, setManualGenerationProgress] = useState(0);
  const [autoStage, setAutoStage] = useState<AutoStage>("idle");
  const [isAutoWidgetExpanded, setIsAutoWidgetExpanded] = useState(false);
  const [autoFailureStage, setAutoFailureStage] = useState<AutoStage>("idle");
  const [automationVisualMode, setAutomationVisualMode] = useState<
    "background" | "images"
  >(initialAutoVisualMode);
  const [autoPrivacyStatus] = useState<"private" | "unlisted" | "public">(
    initialYouTubePrivacy
  );

  const [audioUrl, setAudioUrl] = useState("");
  const [audioPath, setAudioPath] = useState("");
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const [backgroundDuration, setBackgroundDuration] = useState<number | null>(
    null
  );

  const [timedCaptions, setTimedCaptions] = useState<TimedCaption[]>([]);

  const [selectedBackgroundUrl, setSelectedBackgroundUrl] = useState("");
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState("");
  const [visualMode, setVisualMode] = useState<"background" | "images">(initialAutoVisualMode);
  const [videoVisualStyle, setVideoVisualStyle] = useState<VideoVisualStyle>(initialVideoVisualStyle);
  const [backgroundPlaybackSpeed, setBackgroundPlaybackSpeed] = useState(initialBackgroundPlaybackSpeed);
  const [isBackgroundSpeedFit, setIsBackgroundSpeedFit] = useState(initialBackgroundSpeedFit);
  const [isBackgroundReversed, setIsBackgroundReversed] = useState(initialBackgroundReversed);

  const [finalVideoUrl, setFinalVideoUrl] = useState("");
  const [finalVideoPath, setFinalVideoPath] = useState("");
  const [finalVideoSize, setFinalVideoSize] = useState<number | null>(null);
  const [, setSceneImageSummary] = useState("");
  const [sourceVideoName, setSourceVideoName] = useState("");
  const [sourceVideoPath, setSourceVideoPath] = useState("");
  const [sourceVideoUrl, setSourceVideoUrl] = useState("");
  const [sourceVideoDuration, setSourceVideoDuration] = useState<number | null>(
    null
  );
  const [projectStatus, setProjectStatus] = useState("draft");

  const [hasScriptChangedAfterOutputs, setHasScriptChangedAfterOutputs] =
    useState(false);
  const [isSessionDraftReady, setIsSessionDraftReady] = useState(false);

  const applyCreateSessionDraft = useCallback(
    (draft: CreateProjectSessionDraft) => {
      projectIdRef.current = draft.projectId || initialProjectId;
      setProjectId(draft.projectId || initialProjectId);
      setProjectTitle(draft.projectTitle);
      setCurrentStep(draft.currentStep);
      setMaxReachedStep(draft.maxReachedStep);
      setShowAllResults(draft.showAllResults);
      setScriptMode(draft.scriptMode);
      setTopic(draft.topic);
      setScriptDurationSeconds(draft.scriptDurationSeconds);
      setLanguage(draft.language);
      setScript(draft.script);
      setCaptionEmphasisPoints(
        normalizeCaptionEmphasisPoints(draft.captionEmphasisPoints, draft.script)
      );
      setVoice(draft.voice || "nova");
      setAudioUrl(draft.audioUrl);
      setAudioPath(draft.audioPath);
      setAudioDuration(draft.audioDuration);
      setBackgroundDuration(draft.backgroundDuration);
      setTimedCaptions(draft.timedCaptions);
      setSelectedBackgroundUrl(draft.selectedBackgroundUrl);
      setSelectedBackgroundPath(draft.selectedBackgroundPath);
      setVideoVisualStyle(draft.videoVisualStyle);
      setBackgroundPlaybackSpeed(draft.backgroundPlaybackSpeed);
      setIsBackgroundSpeedFit(draft.isBackgroundSpeedFit);
      setIsBackgroundReversed(draft.isBackgroundReversed);
      setFinalVideoUrl(draft.finalVideoUrl);
      setFinalVideoPath(draft.finalVideoPath);
      setFinalVideoSize(null);
      setSourceVideoName(draft.sourceVideoName);
      setSourceVideoPath(draft.sourceVideoPath);
      setSourceVideoUrl(draft.sourceVideoUrl);
      setSourceVideoDuration(draft.sourceVideoDuration);
      setProjectStatus(draft.projectStatus);
      setHasScriptChangedAfterOutputs(draft.hasScriptChangedAfterOutputs);
      setStepNotices(draft.stepNotices);
      scriptOutputsInvalidatedRef.current = draft.hasScriptChangedAfterOutputs;
    },
    [initialProjectId]
  );

  useEffect(() => {
    let isMounted = true;

    async function restoreSessionDraft() {
      await Promise.resolve();

      if (!isMounted) return;

      if (!initialProjectId) {
        clearCreateProjectSessionDraft("");
        setIsSessionDraftReady(true);
        return;
      }

      const draft = loadCreateProjectSessionDraft(initialProjectId);

      if (draft) {
        applyCreateSessionDraft(draft);
        restoredSessionDraftRef.current = true;
        setIsLoadingProject(false);
      }

      setIsSessionDraftReady(true);
    }

    void restoreSessionDraft();

    return () => {
      isMounted = false;
    };
  }, [applyCreateSessionDraft, initialProjectId]);

  useEffect(() => {
    projectIdRef.current = initialProjectId || projectIdRef.current;

    if (!initialProjectId) return;

    async function loadProject() {
      if (!restoredSessionDraftRef.current) {
        setIsLoadingProject(true);
      }

      try {
        let { data, error } = await supabase
          .from("projects")
          .select(PROJECT_SELECT_COLUMNS)
          .eq("id", initialProjectId)
          .single();

        if (
          error &&
          isMissingOptionalProjectColumnMessage(error.message)
        ) {
          const fallbackResult = await supabase
            .from("projects")
            .select(PROJECT_SELECT_COLUMNS_WITHOUT_OPTIONAL_COLUMNS)
            .eq("id", initialProjectId)
            .single();

          data = fallbackResult.data
            ? {
                ...fallbackResult.data,
                caption_emphasis: null,
                final_video_size: null,
                source_video_name: null,
                source_video_path: null,
                source_video_url: null,
                source_video_duration: null,
                visual_mode: null,
                visual_style: null,
              }
            : null;
          error = fallbackResult.error;
        }

        if (error) {
          setStepNotice(1, error.message);
          return;
        }

        const project = data as ProjectRow;

        projectIdRef.current = project.id;
        setProjectId(project.id);
        setProjectTitle(project.title ?? "");
        setTopic(project.topic ?? "");
        setScript(project.script ?? "");
        setCaptionEmphasisPoints(
          normalizeCaptionEmphasisPoints(
            project.caption_emphasis,
            project.script ?? ""
          )
        );
        setVoice(project.voice ?? "nova");
        setProjectStatus(project.status ?? "draft");

        setAudioUrl(project.audio_url ?? "");
        setAudioPath(project.audio_path ?? "");
        setAudioDuration(project.audio_duration ?? null);

        setSelectedBackgroundUrl(project.background_url ?? "");
        setSelectedBackgroundPath(project.background_path ?? "");
        setVisualMode(
          project.visual_mode === "images" || project.background_path === "__auto_images__"
            ? "images"
            : "background"
        );
        setVideoVisualStyle(getSafeVideoVisualStyle(project.visual_style));
        setBackgroundDuration(project.background_duration ?? null);

        setFinalVideoUrl(project.final_video_url ?? "");
        setFinalVideoPath(project.final_video_path ?? "");
        setFinalVideoSize(project.final_video_size ?? null);
        setSourceVideoName(project.source_video_name ?? "");
        setSourceVideoPath(project.source_video_path ?? "");
        setSourceVideoUrl(project.source_video_url ?? "");
        setSourceVideoDuration(project.source_video_duration ?? null);

        setTimedCaptions(
          Array.isArray(project.timed_captions) ? project.timed_captions : []
        );

        scriptOutputsInvalidatedRef.current = false;
        scriptCleanupPromiseRef.current = null;
        setHasScriptChangedAfterOutputs(false);

        if (project.script) {
          setScriptMode("manual");
        }

        if (project.status === "completed") {
          setCurrentStep(4);
          setMaxReachedStep(4);
          setStepNotice(4, textFor("저장 완료된 프로젝트를 불러왔습니다.", "Loaded the saved project."));
        } else if (project.status === "final_ready") {
          setCurrentStep(4);
          setMaxReachedStep(4);
          setStepNotice(4, textFor("완성 영상이 준비되어 있습니다.", "The final video is ready."));
        } else if (project.status === "background_selected") {
          setCurrentStep(3);
          setMaxReachedStep(3);
          setStepNotice(3, textFor("저장된 배경 선택 상태를 불러왔습니다.", "Loaded the saved background selection."));
        } else if (project.status === "audio_ready") {
          setCurrentStep(3);
          setMaxReachedStep(3);
          setStepNotice(3, textFor("저장된 음성 파일을 불러왔습니다.", "Loaded the saved voice file."));
        } else if (project.status === "script_ready") {
          setCurrentStep(2);
          setMaxReachedStep(2);
          setStepNotice(2, textFor("저장된 대본을 불러왔습니다.", "Loaded the saved script."));
        } else {
          setCurrentStep(1);
          setMaxReachedStep(1);
          setStepNotice(1, textFor("저장된 프로젝트를 불러왔습니다.", "Loaded the saved project."));
        }
      } finally {
        setIsLoadingProject(false);
      }
    }

    void loadProject();
  }, [initialProjectId, supabase, textFor]);

  useEffect(() => {
    if (!isSessionDraftReady || isLoadingProject) return;

    const saveTimer = setTimeout(() => {
      const draft: CreateProjectSessionDraft = {
        version: 1,
        savedAt: Date.now(),
        projectId: projectIdRef.current || projectId || "",
        projectTitle,
        currentStep,
        maxReachedStep,
        showAllResults,
        scriptMode,
        topic,
        scriptDurationSeconds,
        language,
        script,
        captionEmphasisPoints,
        voice,
        audioUrl,
        audioPath,
        audioDuration,
        backgroundDuration,
        timedCaptions,
        selectedBackgroundUrl,
        selectedBackgroundPath,
        videoVisualStyle,
        backgroundPlaybackSpeed,
        isBackgroundSpeedFit,
        isBackgroundReversed,
        finalVideoUrl,
        finalVideoPath,
        sourceVideoName,
        sourceVideoPath,
        sourceVideoUrl,
        sourceVideoDuration,
        projectStatus,
        hasScriptChangedAfterOutputs,
        stepNotices,
      };

      saveCreateProjectSessionDraft(initialProjectId, draft);
    }, 300);

    return () => {
      clearTimeout(saveTimer);
    };
  }, [
    audioDuration,
    audioPath,
    audioUrl,
    backgroundDuration,
    backgroundPlaybackSpeed,
    captionEmphasisPoints,
    currentStep,
    finalVideoPath,
    finalVideoUrl,
    hasScriptChangedAfterOutputs,
    initialProjectId,
    isLoadingProject,
    isBackgroundReversed,
    isBackgroundSpeedFit,
    isSessionDraftReady,
    language,
    scriptDurationSeconds,
    maxReachedStep,
    projectId,
    projectStatus,
    projectTitle,
    script,
    scriptMode,
    selectedBackgroundPath,
    selectedBackgroundUrl,
    videoVisualStyle,
    showAllResults,
    sourceVideoDuration,
    sourceVideoName,
    sourceVideoPath,
    sourceVideoUrl,
    stepNotices,
    timedCaptions,
    topic,
    voice,
  ]);

  useEffect(() => {
    return () => {
      if (scriptSaveTimeoutRef.current) {
        clearTimeout(scriptSaveTimeoutRef.current);
      }

      scriptSaveAbortRef.current?.abort();
    };
  }, []);

  function setStepNotice(step: Step, message: string) {
    setStepNotices((prev) => ({
      ...prev,
      [step]: message,
    }));
  }

  function clearStepNotice(step: Step) {
    setStepNotice(step, "");
  }

  function getCurrentProjectId() {
    // The ref is the synchronous source of truth. Falling back to React state
    // can resurrect the previous automation project before a state update lands.
    return projectIdRef.current;
  }

  function syncProjectId(nextProjectId: string) {
    projectIdRef.current = nextProjectId;
    setProjectId(nextProjectId);
  }

  function getSafeProjectTitle() {
    return getSafeProjectTitleFrom({ topicValue: topic, scriptValue: script });
  }

  function getSafeProjectTitleFrom({
    topicValue,
    scriptValue,
  }: {
    topicValue: string;
    scriptValue: string;
  }) {
    if (projectTitle.trim()) return projectTitle.trim();
    if (topicValue.trim()) return topicValue.trim();
    if (sourceVideoName.trim()) return sourceVideoName.trim();
    if (scriptValue.trim()) {
      return textFor("직접 작성한 쇼츠 프로젝트", "Manual shorts project");
    }
    return textFor("새 쇼츠 프로젝트", "New shorts project");
  }

  async function analyzeProjectMetadata(scriptValue: string) {
    const response = await fetch("/api/analyze-project-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: scriptValue }),
    });
    const { data } = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(
          data,
          textFor("제목과 주제 분석에 실패했습니다.", "Could not analyze the title and topic.")
        )
      );
    }

    return {
      title: typeof data?.title === "string" ? data.title.trim() : "",
      topic: typeof data?.topic === "string" ? data.topic.trim() : "",
    };
  }

  function getCurrentStatus() {
    if (hasScriptChangedAfterOutputs) {
      return script.trim() ? "script_ready" : "draft";
    }

    if (projectStatus === "completed") return "completed";
    if (projectStatus === "background_selected") return "background_selected";
    if (projectStatus === "audio_ready") return "audio_ready";
    if (projectStatus === "script_ready") return "script_ready";
    if (finalVideoUrl) return "final_ready";
    if (selectedBackgroundUrl) return "background_selected";
    if (audioUrl) return "audio_ready";
    if (script.trim()) return "script_ready";
    return "draft";
  }

  function getCaptionEmphasisPayload() {
    const points = normalizeCaptionEmphasisPoints(
      captionEmphasisPoints,
      script
    ).filter((point) => point.enabled && point.text.trim());

    return points.length > 0 ? points : null;
  }

  async function getCurrentUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) return session.user;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error(textFor("로그인이 필요합니다.", "Login is required."));
    }

    return user;
  }

  function getApiErrorMessage(data: unknown, fallback: string) {
    if (!data || typeof data !== "object") return fallback;

    const errorData = data as Record<string, unknown>;
    const message =
      typeof errorData.error === "string" ? errorData.error : fallback;

    if (errorData.code === "INSUFFICIENT_CREDITS") {
      const required =
        typeof errorData.requiredCredits === "number"
          ? errorData.requiredCredits
          : null;
      const remaining =
        typeof errorData.remainingCredits === "number"
          ? errorData.remainingCredits
          : null;

      if (required !== null && remaining !== null) {
        return textFor(
          `영상 생성을 시작하려면 ${required}크레딧이 필요합니다. 현재 ${remaining}크레딧이 남아 있습니다.`,
          `Video generation needs ${required} credits. You have ${remaining} remaining.`
        );
      }

      return textFor(
        "영상 생성을 시작하기 전에 크레딧이 부족합니다. 프로필에서 사용량을 확인해주세요.",
        "There are not enough credits to start video generation. Check usage in Profile."
      );
    }

    return message;
  }

  async function analyzeCaptionEmphasisForScript(
    scriptValue: string,
    noticeStep: 1 | 2
  ) {
    const trimmedScript = scriptValue.trim();

    if (!trimmedScript) {
      setCaptionEmphasisPoints([]);
      return [];
    }

    setIsAnalyzingCaptionEmphasis(true);
    setStepNotice(
      noticeStep,
      textFor(
        "대본에서 강조할 부분을 찾고 있습니다...",
        "Finding parts to emphasize in the script..."
      )
    );

    try {
      const response = await fetch("/api/analyze-caption-emphasis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script: trimmedScript,
        }),
      });

      const { data } = await readJsonResponse(response);

      if (!response.ok) {
        setStepNotice(
          noticeStep,
          getApiErrorMessage(data, textFor("강조 포인트 분석에 실패했습니다.", "Could not analyze emphasis points."))
        );
        return [];
      }

      const points = Array.isArray(data?.points)
        ? (data.points as CaptionEmphasisPoint[])
        : [];

      setCaptionEmphasisPoints(points);
      clearStepNotice(noticeStep);

      return points;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : textFor("강조 포인트 분석 중 오류가 발생했습니다.", "An error occurred while analyzing emphasis points.");

      setStepNotice(noticeStep, message);
      return [];
    } finally {
      setIsAnalyzingCaptionEmphasis(false);
    }
  }

  async function sendProjectSnapshot(
    values: ProjectSavePayload,
    snapshotProjectId: string | null,
    signal?: AbortSignal
  ) {
    const response = await fetch("/api/projects/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        projectId: snapshotProjectId,
        ...values,
        caption_emphasis:
          values.caption_emphasis === undefined
            ? getCaptionEmphasisPayload()
            : values.caption_emphasis,
        visual_mode: values.visual_mode ?? visualMode,
        visual_style: values.visual_style ?? videoVisualStyle,
      }),
    });

    const { data, parseError } = await readJsonResponse(response);

    if (!response.ok || parseError) {
      throw new Error(
        parseError
          ? textFor(
              "프로젝트 저장 서버가 응답을 중단했습니다. 잠시 후 다시 시도해주세요.",
              "The project save server stopped responding. Please try again shortly."
            )
          : getApiErrorMessage(
              data,
              textFor("프로젝트 저장에 실패했습니다.", "Could not save the project.")
            )
      );
    }

    const payload = data as { projectId?: unknown; status?: unknown };

    if (typeof payload.projectId === "string" && payload.projectId) {
      syncProjectId(payload.projectId);
    }

    if (typeof payload.status === "string") {
      setProjectStatus(payload.status);
    }

    return payload.projectId as string;
  }

  async function saveProjectSnapshot(
    values: ProjectSavePayload,
    signal?: AbortSignal
  ) {
    const saveTask = saveQueueRef.current
      .catch(() => undefined)
      .then(() =>
        sendProjectSnapshot(values, getCurrentProjectId() || null, signal)
      );

    saveQueueRef.current = saveTask.then(
      () => undefined,
      () => undefined
    );

    return saveTask;
  }

  function cleanupProjectFiles(scope: CleanupScope = "all") {
    const currentProjectId = getCurrentProjectId();

    if (!currentProjectId) return Promise.resolve();

    const cleanupTask = cleanupQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/projects/cleanup-files", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: currentProjectId,
            scope,
          }),
        });

        const { data, parseError } = await readJsonResponse(response);

        if (!response.ok || parseError) {
          const message =
            data && typeof data === "object" && "error" in data && typeof data.error === "string"
              ? data.error
              : parseError
                ? textFor(
                    "파일 정리 서버가 응답을 중단했습니다.",
                    "The file cleanup server stopped responding."
                  )
                : textFor("기존 파일 삭제에 실패했습니다.", "Could not delete existing files.");
          throw new Error(message);
        }
      });

    cleanupQueueRef.current = cleanupTask.catch(() => undefined);
    return cleanupTask;
  }

  async function removeGeneratedFile(
    bucket: GeneratedFileBucket,
    path: string
  ) {
    if (!path) return;

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      throw new Error(error.message);
    }
  }

  async function ensureProjectId() {
    const currentProjectId = getCurrentProjectId();

    if (currentProjectId) {
      return currentProjectId;
    }

    const createdProjectId = await saveProjectSnapshot({
      title: getSafeProjectTitle(),
      topic: topic.trim() || null,
      script: script.trim() || null,
      voice,
      audio_path: null,
      audio_url: null,
      audio_duration: null,
      background_path: null,
      background_url: null,
      background_duration: null,
      final_video_path: null,
      final_video_url: null,
      timed_captions: null,
      status: getCurrentStatus(),
    });

    return createdProjectId;
  }

  function saveExistingProjectInBackground(values: ProjectSavePayload) {
    if (!getCurrentProjectId()) return;

    void saveProjectSnapshot(values).catch((error: unknown) => {
      if (error instanceof Error) {
        console.warn("프로젝트 저장 실패:", error.message);
      }
    });
  }

  function cancelScheduledScriptSave() {
    if (scriptSaveTimeoutRef.current) {
      clearTimeout(scriptSaveTimeoutRef.current);
      scriptSaveTimeoutRef.current = null;
    }

    scriptSaveAbortRef.current?.abort();
    scriptSaveAbortRef.current = null;
  }

  async function waitForPendingScriptCleanup() {
    if (scriptCleanupPromiseRef.current) {
      await scriptCleanupPromiseRef.current;
    }
  }

  function scheduleScriptSave(nextScript: string) {
    cancelScheduledScriptSave();

    if (!getCurrentProjectId()) return;

    const controller = new AbortController();
    scriptSaveAbortRef.current = controller;

    scriptSaveTimeoutRef.current = setTimeout(() => {
      scriptSaveTimeoutRef.current = null;

      void (async () => {
        try {
          await waitForPendingScriptCleanup();

          if (controller.signal.aborted) return;

          await saveProjectSnapshot(
            getClearedSnapshotAfterScriptChange(nextScript),
            controller.signal
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.name !== "AbortError") {
            console.warn("대본 자동 저장 실패:", error.message);
          }
        } finally {
          if (scriptSaveAbortRef.current === controller) {
            scriptSaveAbortRef.current = null;
          }
        }
      })();
    }, 700);
  }

  function markScriptOutputsCurrent() {
    cancelScheduledScriptSave();
    scriptOutputsInvalidatedRef.current = false;
    scriptCleanupPromiseRef.current = null;
    setHasScriptChangedAfterOutputs(false);
  }

  function clearAfterScriptChange(nextMaxStep: Step = 1) {
    setAudioUrl("");
    setAudioPath("");
    setAudioDuration(null);
    setBackgroundDuration(null);
    setTimedCaptions([]);
    setSelectedBackgroundUrl("");
    setSelectedBackgroundPath("");
    setFinalVideoUrl("");
    setFinalVideoPath("");
    setFinalVideoSize(null);
    setSceneImageSummary("");
    setProjectStatus(nextMaxStep >= 2 ? "script_ready" : "draft");
    setMaxReachedStep(nextMaxStep);
    setHasScriptChangedAfterOutputs(true);

    setStepNotices((prev) => ({
      ...prev,
      2: "",
      3: "",
      4: "",
    }));
  }

  function getClearedSnapshotAfterScriptChange(
    nextScript: string
  ): ProjectSavePayload {
    const trimmedScript = nextScript.trim();

    return {
      title: getSafeProjectTitleFrom({
        topicValue: topic,
        scriptValue: trimmedScript,
      }),
      topic: topic.trim() || null,
      script: trimmedScript || null,
      voice,
      audio_path: null,
      audio_url: null,
      audio_duration: null,
      background_path: null,
      background_url: null,
      background_duration: null,
      final_video_path: null,
      final_video_url: null,
      timed_captions: null,
      status: trimmedScript ? "script_ready" : "draft",
    };
  }

  async function resetAfterTopicChange(nextTopic: string) {
    cancelScheduledScriptSave();

    try {
      await waitForPendingScriptCleanup();
      await cleanupProjectFiles("all");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setStepNotice(1, error.message);
      }
      return;
    }

    setScript("");
    setCaptionEmphasisPoints([]);
    clearAfterScriptChange(1);

    setStepNotices({
      1: textFor(
        "이전 결과 파일이 삭제되고 초기화되었습니다. 대본을 다시 생성해주세요.",
        "Previous result files were deleted and reset. Generate the script again."
      ),
      2: "",
      3: "",
      4: "",
    });

    saveExistingProjectInBackground({
      title: getSafeProjectTitleFrom({ topicValue: nextTopic, scriptValue: "" }),
      topic: nextTopic.trim() || null,
      script: null,
      voice,
      audio_path: null,
      audio_url: null,
      audio_duration: null,
      background_path: null,
      background_url: null,
      background_duration: null,
      final_video_path: null,
      final_video_url: null,
      timed_captions: null,
      status: "draft",
    });
  }

  function handleScriptChange(nextScript: string, noticeStep: 1 | 2) {
    const limitedScript = nextScript.slice(0, SCRIPT_MAX_LENGTH);

    setScript(limitedScript);

    const trimmedScript = limitedScript.trim();

    if (!trimmedScript) {
      setCaptionEmphasisPoints([]);
    }

    if (!scriptOutputsInvalidatedRef.current) {
      scriptOutputsInvalidatedRef.current = true;

      const cleanupPromise = cleanupProjectFiles("all");
      scriptCleanupPromiseRef.current = cleanupPromise;

      void cleanupPromise.catch((error: unknown) => {
        scriptOutputsInvalidatedRef.current = false;

        if (scriptCleanupPromiseRef.current === cleanupPromise) {
          scriptCleanupPromiseRef.current = null;
        }

        if (error instanceof Error) {
          setStepNotice(noticeStep, error.message);
        }
      });
    }

    clearAfterScriptChange(trimmedScript ? 2 : 1);

    setStepNotices((prev) => ({
      ...prev,
      [noticeStep]: trimmedScript
        ? textFor(
            "대본이 수정되어 기존 음성/완성 영상 파일이 삭제되고 이후 단계 결과가 초기화되었습니다.",
            "The script changed, so existing voice/final video files were deleted and later results were reset."
          )
        : textFor("대본이 비어 있습니다.", "The script is empty."),
      3: "",
      4: "",
    }));

    scheduleScriptSave(limitedScript);
  }

  async function resetAfterVoiceChange(nextVoice: string) {
    cancelScheduledScriptSave();

    try {
      await waitForPendingScriptCleanup();
      await cleanupProjectFiles("all");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setStepNotice(2, error.message);
      }
      return;
    }

    setVoice(nextVoice);
    setHasScriptChangedAfterOutputs(true);

    setAudioUrl("");
    setAudioPath("");
    setAudioDuration(null);
    setBackgroundDuration(null);
    setTimedCaptions([]);
    setSelectedBackgroundUrl("");
    setSelectedBackgroundPath("");
    setFinalVideoUrl("");
    setFinalVideoPath("");
    setFinalVideoSize(null);
    setProjectStatus("script_ready");
    setMaxReachedStep(2);

    setStepNotices((prev) => ({
      ...prev,
      2: textFor(
        "목소리가 변경되었습니다. 기존 음성/완성 영상 파일이 삭제되었습니다. 새 목소리로 MP3 음성을 다시 생성해주세요.",
        "The voice changed. Existing voice/final video files were deleted. Generate MP3 voice again with the new voice."
      ),
      3: "",
      4: "",
    }));

    saveExistingProjectInBackground({
      title: getSafeProjectTitle(),
      topic: topic.trim() || null,
      script: script.trim() || null,
      voice: nextVoice,
      audio_path: null,
      audio_url: null,
      audio_duration: null,
      background_path: null,
      background_url: null,
      background_duration: null,
      final_video_path: null,
      final_video_url: null,
      timed_captions: null,
      status: "script_ready",
    });
  }

  function moveStep(direction: -1 | 1) {
    if (stepNavigationLockRef.current) return;

    stepNavigationLockRef.current = true;
    setIsStepNavigating(true);
    setCurrentStep((previousStep) => {
      const nextStep = previousStep + direction;

      if (nextStep < 1 || nextStep > maxReachedStep) return previousStep;

      return nextStep as Step;
    });

    window.setTimeout(() => {
      stepNavigationLockRef.current = false;
      setIsStepNavigating(false);
    }, 180);
  }

  function goPrevStep() {
    moveStep(-1);
  }

  function goNextStep() {
    moveStep(1);
  }

  function revealNextStep() {
    if (!autoRunRef.current) {
      setNextStepRevealToken((token) => token + 1);
    }
  }

  async function saveAndGoDashboard() {
    cancelScheduledScriptSave();
    setIsSavingAndLeaving(true);

    try {
      await waitForPendingScriptCleanup();

      if (hasScriptChangedAfterOutputs) {
        await saveProjectSnapshot({
          title: getSafeProjectTitle(),
          topic: topic.trim() || null,
          script: script.trim() || null,
          voice,
          audio_path: null,
          audio_url: null,
          audio_duration: null,
          background_path: null,
          background_url: null,
          background_duration: null,
          final_video_path: null,
          final_video_url: null,
          timed_captions: null,
          status: script.trim() ? "script_ready" : "draft",
        });
      } else {
        await saveProjectSnapshot({
          title: getSafeProjectTitle(),
          topic: topic.trim() || null,
          script: script.trim() || null,
          voice,
          audio_path: audioPath || null,
          audio_url: audioUrl || null,
          audio_duration: audioDuration,
          background_path: selectedBackgroundPath || null,
          background_url: selectedBackgroundUrl || null,
          background_duration: backgroundDuration,
          final_video_path: finalVideoPath || null,
          final_video_url: finalVideoUrl || null,
          final_video_size: finalVideoSize,
          timed_captions: timedCaptions.length > 0 ? timedCaptions : null,
          status: getCurrentStatus(),
        });
      }

      router.push("/dashboard");
    } catch (error: unknown) {
      let message = textFor(
        "프로젝트 저장 중 오류가 발생했습니다.",
        "An error occurred while saving the project."
      );

      if (error instanceof Error) {
        message = error.message;
      }

      setStepNotice(currentStep, message);
    } finally {
      setIsSavingAndLeaving(false);
    }
  }

  async function canSaveCompletedProject() {
    if (projectStatus === "completed") return true;

    const limitsResponse = await fetch("/api/plan-limits", {
      cache: "no-store",
    });
    const limitsData = await limitsResponse.json().catch(() => null);
    const completedProjectLimit = limitsData?.limits?.completedProjectLimit;
    const completedProjectCount = limitsData?.usage?.completedProjectCount;

    if (
      typeof completedProjectLimit === "number" &&
      typeof completedProjectCount === "number" &&
      completedProjectCount >= completedProjectLimit
    ) {
      setStepNotice(
        3,
        textFor(
          `완성된 프로젝트는 현재 요금제에서 최대 ${completedProjectLimit}개까지 저장할 수 있습니다.`,
          `Your current plan can save up to ${completedProjectLimit} completed projects.`
        )
      );
      return false;
    }

    return true;
  }

  function formatDuration(seconds: number) {
    const rounded = Math.round(seconds);
    const min = Math.floor(rounded / 60);
    const sec = rounded % 60;

    if (initialLocale === "en") {
      if (min <= 0) return `${sec}s`;
      return `${min}m ${sec}s`;
    }

    if (min <= 0) return `${sec}초`;
    return `${min}분 ${sec}초`;
  }

  async function getMediaDuration(url: string, fileType: "audio" | "video") {
    const response = await fetch("/api/media-duration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, fileType }),
    });

    const { data } = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(
          data,
          textFor("파일 길이를 확인하지 못했습니다.", "Could not check file duration.")
        )
      );
    }

    const duration =
      typeof data?.duration === "number" ? data.duration : Number(data?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(textFor("파일 길이를 확인하지 못했습니다.", "Could not check file duration."));
    }

    return duration;
  }

  function getPreviewTitle() {
    if (showAllResults) {
      return textFor("전체 결과 보기", "All results");
    }

    const previewLabels = siteText.create.preview;

    if (currentStep === 1) return previewLabels.scriptTitle;
    if (currentStep === 2) return previewLabels.audioTitle;
    if (currentStep === 3) {
      return finalVideoUrl
        ? projectStatus === "final_ready" || projectStatus === "completed"
          ? previewLabels.finalTitle
          : textFor("기존 완성 영상", "Previous final video")
        : previewLabels.backgroundTitle;
    }
    return previewLabels.finalTitle;
  }

  function handleScriptModeChange(nextMode: "auto" | "manual") {
    setScriptMode(nextMode);
    setStepNotice(
      1,
      nextMode === "auto"
        ? textFor("AI 대본 자동 생성 모드입니다.", "AI script generation mode.")
        : textFor(
            "대본 직접 작성 모드입니다. 입력한 내용이 바로 대본으로 적용됩니다.",
            "Manual script mode. Your input is applied directly as the script."
          )
    );
  }

  function handleTopicChange(nextTopic: string) {
    setTopic(nextTopic);
    if (maxReachedStep > 1) {
      void resetAfterTopicChange(nextTopic);
    }
  }

  function handleDurationChange(nextDurationSeconds: number) {
    const safeDurationSeconds = Math.min(
      120,
      Math.max(30, Math.round(nextDurationSeconds))
    );

    if (scriptDurationSeconds === safeDurationSeconds) return;

    setScriptDurationSeconds(safeDurationSeconds);
    if (maxReachedStep > 1) {
      void resetAfterTopicChange(topic);
    }
  }

  function handleLanguageChange(nextLanguage: ScriptLanguage) {
    if (language === nextLanguage) return;

    setLanguage(nextLanguage);
    if (maxReachedStep > 1) {
      void resetAfterTopicChange(topic);
    }
  }

  function handleVoiceChange(nextVoice: string) {
    if (voice !== nextVoice) {
      void resetAfterVoiceChange(nextVoice);
    }
  }

  function handleAddCaptionEmphasis() {
    setCaptionEmphasisPoints((prev) => [
      ...prev,
      createCaptionEmphasisPoint(
        {
          id: `caption-emphasis-custom-${Date.now()}`,
          text: "",
          effect: "highlight",
          enabled: true,
          reason: textFor("직접 추가한 강조 포인트", "Manually added emphasis point"),
        },
        prev.length + 1
      ),
    ]);
  }

  function handleRemoveCaptionEmphasis(id: string) {
    setCaptionEmphasisPoints((prev) =>
      prev.filter((point) => point.id !== id)
    );
  }

  function handleToggleCaptionEmphasis(id: string) {
    setCaptionEmphasisPoints((prev) =>
      prev.map((point) =>
        point.id === id ? { ...point, enabled: !point.enabled } : point
      )
    );
  }

  function handleCaptionEmphasisTextChange(id: string, value: string) {
    setCaptionEmphasisPoints((prev) =>
      prev.map((point) =>
        point.id === id ? { ...point, text: value } : point
      )
    );
  }

  function handleCaptionEmphasisEffectChange(
    id: string,
    effect: CaptionEffect
  ) {
    setCaptionEmphasisPoints((prev) =>
      prev.map((point) =>
        point.id === id ? { ...point, effect } : point
      )
    );
  }

  async function handleGenerateScript(e: React.FormEvent) {
    e.preventDefault();

    cancelScheduledScriptSave();
    setIsGeneratingScript(true);

    try {
      await waitForPendingScriptCleanup();
      await cleanupProjectFiles("all");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setStepNotice(1, error.message);
        if (autoRunRef.current) finishAutoRunWithError(error.message);
      }
      setIsGeneratingScript(false);
      return;
    }

    setScript("");
    setCaptionEmphasisPoints([]);
    setAudioUrl("");
    setAudioPath("");
    setAudioDuration(null);
    setBackgroundDuration(null);
    setTimedCaptions([]);
    setSelectedBackgroundUrl("");
    setSelectedBackgroundPath("");
    setFinalVideoUrl("");
    setFinalVideoPath("");
    setFinalVideoSize(null);
    setProjectStatus("draft");
    setMaxReachedStep(1);
    setHasScriptChangedAfterOutputs(true);

    setStepNotices({
      1: textFor("대본 생성 중입니다...", "Generating script..."),
      2: "",
      3: "",
      4: "",
    });

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          durationSeconds: scriptDurationSeconds,
          language,
          visualStyle: videoVisualStyle,
        }),
      });

      const { data } = await readJsonResponse(response);

      if (!response.ok) {
        const errorMessage = getApiErrorMessage(
          data,
          textFor("대본 생성에 실패했습니다.", "Could not generate the script.")
        );
        setStepNotice(1, errorMessage);
        if (autoRunRef.current) finishAutoRunWithError(errorMessage);
        return;
      }

      const generatedScript = typeof data?.script === "string" ? data.script.trim() : "";
      if (!generatedScript) {
        throw new Error(textFor("대본 생성 결과를 확인하지 못했습니다.", "Could not read the generated script."));
      }
      const generatedTopic =
        typeof data?.topic === "string" ? data.topic.trim() : "";
      let nextTopic = topic.trim() || generatedTopic;
      let nextProjectTitle = projectTitle.trim();

      if (!nextProjectTitle || !nextTopic) {
        try {
          const metadata = await analyzeProjectMetadata(generatedScript);
          nextProjectTitle ||= metadata.title;
          nextTopic ||= metadata.topic;
        } catch (error) {
          // Metadata only improves labels. A transient model error must not
          // interrupt a completed paid script generation or Pro automation.
          console.warn("Project metadata analysis skipped", error);
        }
      }

      setScript(generatedScript);
      if (!projectTitle.trim() && nextProjectTitle) {
        setProjectTitle(nextProjectTitle);
      }
      if (!topic.trim() && nextTopic) {
        setTopic(nextTopic);
      }
      setCaptionEmphasisPoints([]);
      const generatedEmphasisPoints = await analyzeCaptionEmphasisForScript(
        generatedScript,
        1
      );

      await saveProjectSnapshot({
        title:
          nextProjectTitle ||
          getSafeProjectTitleFrom({
            topicValue: nextTopic,
            scriptValue: generatedScript,
          }),
        topic: nextTopic || null,
        script: generatedScript,
        voice,
        audio_path: null,
        audio_url: null,
        audio_duration: null,
        background_path: null,
        background_url: null,
        background_duration: null,
        final_video_path: null,
        final_video_url: null,
        timed_captions: null,
        caption_emphasis:
          generatedEmphasisPoints.length > 0 ? generatedEmphasisPoints : null,
        status: "script_ready",
      });

      markScriptOutputsCurrent();
      setProjectStatus("script_ready");
      clearStepNotice(1);
      setMaxReachedStep(2);
      revealNextStep();
      if (autoRunRef.current) setAutoStage("voice");
    } catch (error: unknown) {
      let message = textFor(
        "대본 생성 중 오류가 발생했습니다.",
        "An error occurred while generating the script."
      );

      if (error instanceof Error) {
        message = error.message;
      }

      setStepNotice(1, message);
      if (autoRunRef.current) finishAutoRunWithError(message);
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function analyzeAudioSync(audioPublicUrl: string) {
    setStepNotice(2, textFor("음성 자막 싱크를 분석 중입니다...", "Analyzing voice caption sync..."));

    const response = await fetch("/api/transcribe-audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audioUrl: audioPublicUrl,
        script,
        language,
      }),
    });

    const { data } = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(
          data,
          textFor("음성 자막 싱크 분석에 실패했습니다.", "Could not analyze voice caption sync.")
        )
      );
    }

    if (!Array.isArray(data?.timedCaptions) || data.timedCaptions.length === 0) {
      throw new Error(textFor("자막 타임스탬프가 비어 있습니다.", "Caption timestamps are empty."));
    }

    const captions = data.timedCaptions as TimedCaption[];

    setTimedCaptions(captions);

    return captions;
  }

  async function handleGenerateTTSFile() {
    if (!script.trim()) {
      setStepNotice(2, textFor("먼저 대본을 생성하거나 입력해주세요.", "Generate or enter a script first."));
      return;
    }

    cancelScheduledScriptSave();
    setIsGeneratingTTS(true);

    setStepNotices((prev) => ({
      ...prev,
      2: textFor(
        "기존 음성/완성 영상 파일을 정리 중입니다...",
        "Cleaning up existing voice/final video files..."
      ),
      3: "",
      4: "",
    }));

    try {
      await waitForPendingScriptCleanup();
      await cleanupProjectFiles("all");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setStepNotice(2, error.message);
        if (autoRunRef.current) finishAutoRunWithError(error.message);
      }
      setIsGeneratingTTS(false);
      return;
    }

    setAudioUrl("");
    setAudioPath("");
    setAudioDuration(null);
    setBackgroundDuration(null);
    setTimedCaptions([]);
    setSelectedBackgroundUrl("");
    setSelectedBackgroundPath("");
    setFinalVideoUrl("");
    setFinalVideoPath("");
    setFinalVideoSize(null);
    setProjectStatus("script_ready");
    setMaxReachedStep(2);

    setStepNotices((prev) => ({
      ...prev,
      2: textFor(
        "선택한 목소리로 음성 파일을 생성 중입니다...",
        "Generating voice with the selected voice..."
      ),
      3: "",
      4: "",
    }));

    let uploadedAudioPath = "";
    let audioSnapshotSaved = false;

    try {
      const user = await getCurrentUser();
      const currentProjectId = await ensureProjectId();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: script, voice }),
      });

      if (!response.ok) {
        const { data } = await readJsonResponse(response);
        const errorMessage = getApiErrorMessage(
          data,
          textFor("음성 파일 생성에 실패했습니다.", "Could not generate the voice file.")
        );
        setStepNotice(2, errorMessage);
        if (autoRunRef.current) finishAutoRunWithError(errorMessage);
        return;
      }

      const audioBlob = await response.blob();

      const fileName = `audio-${createFileToken()}-${voice}.mp3`;
      const filePath = `${user.id}/${currentProjectId}/${fileName}`;

      await ensureStorageBucket("tts-audio");

      const { error: uploadError } = await supabase.storage
        .from("tts-audio")
        .upload(filePath, audioBlob, {
          contentType: "audio/mpeg",
        });

      if (uploadError) {
        const errorMessage = uploadError.message;
        setStepNotice(2, errorMessage);
        if (autoRunRef.current) finishAutoRunWithError(errorMessage);
        return;
      }

      uploadedAudioPath = filePath;

      const { data: publicUrlData } = supabase.storage
        .from("tts-audio")
        .getPublicUrl(filePath);

      const publicAudioUrl = publicUrlData.publicUrl;

      setAudioUrl(publicAudioUrl);
      setAudioPath(filePath);

      setStepNotice(2, textFor("음성 길이를 확인 중입니다...", "Checking audio length..."));
      const mp3Duration = await getMediaDuration(publicAudioUrl, "audio");
      setAudioDuration(mp3Duration);

      const captions = await analyzeAudioSync(publicAudioUrl);

      await saveProjectSnapshot({
        title: getSafeProjectTitle(),
        topic: topic.trim() || null,
        script,
        voice,
        audio_path: filePath,
        audio_url: publicAudioUrl,
        audio_duration: mp3Duration,
        background_path: null,
        background_url: null,
        background_duration: null,
        final_video_path: null,
        final_video_url: null,
        timed_captions: captions,
        status: "audio_ready",
      });

      audioSnapshotSaved = true;

      markScriptOutputsCurrent();
      setProjectStatus("audio_ready");
      clearStepNotice(2);
      setMaxReachedStep(3);
      revealNextStep();
      if (autoRunRef.current) setAutoStage("render");
    } catch (error: unknown) {
      let errorMessage = textFor(
        "음성 파일 생성 중 오류가 발생했습니다.",
        "An error occurred while generating the voice file."
      );

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      if (uploadedAudioPath && !audioSnapshotSaved) {
        try {
          await removeGeneratedFile("tts-audio", uploadedAudioPath);
          setAudioUrl("");
          setAudioPath("");
        } catch (cleanupError: unknown) {
          const cleanupMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : textFor(
                  "업로드된 음성 파일 정리에 실패했습니다.",
                  "Could not clean up the uploaded voice file."
                );

          errorMessage = `${errorMessage} ${textFor(
            "업로드된 음성 파일 정리도 실패했습니다:",
            "Uploaded voice file cleanup also failed:"
          )} ${cleanupMessage}`;
        }
      }

      setStepNotice(2, errorMessage);
      if (autoRunRef.current) finishAutoRunWithError(errorMessage);
    } finally {
      setIsGeneratingTTS(false);
    }
  }

  async function handleSelectBackground(video: BackgroundVideo) {
    const previousBackgroundUrl = selectedBackgroundUrl;
    const previousBackgroundPath = selectedBackgroundPath;
    const previousBackgroundDuration = backgroundDuration;
    const previousProjectStatus = projectStatus;

    setSelectedBackgroundUrl(video.url);
    setSelectedBackgroundPath(video.path);
    setBackgroundDuration(null);

    if (!audioDuration) {
      setStepNotice(
        3,
        textFor(
          "음성 길이를 먼저 확인해야 배경 영상 길이와 비교할 수 있습니다.",
          "Check the audio length before comparing it with the background video."
        )
      );
      return;
    }

    setProjectStatus("background_selected");
    setMaxReachedStep(3);
    setStepNotices((prev) => ({
      ...prev,
      4: "",
    }));

    setStepNotice(
      3,
      textFor(
        "배경 영상 길이를 확인하고 있습니다...",
        "Checking the background video length..."
      )
    );

    try {
      const videoDuration = await getMediaDuration(video.url, "video");

      setBackgroundDuration(videoDuration);

      if (isBackgroundSpeedFit) {
        setBackgroundPlaybackSpeed(
          Math.min(
            5,
            Math.max(0.5, Math.round((videoDuration / audioDuration) * 100) / 100)
          )
        );
      }

      await saveProjectSnapshot({
        title: getSafeProjectTitle(),
        topic: topic.trim() || null,
        script: script.trim() || null,
        voice,
        audio_path: audioPath || null,
        audio_url: audioUrl || null,
        audio_duration: audioDuration,
        background_path: video.path,
        background_url: video.url,
        background_duration: videoDuration,
        final_video_path: finalVideoPath || null,
        final_video_url: finalVideoUrl || null,
        final_video_size: finalVideoSize,
        timed_captions: timedCaptions.length > 0 ? timedCaptions : null,
        status: "background_selected",
      });

      setProjectStatus("background_selected");
      clearStepNotice(3);
    } catch (error: unknown) {
      setSelectedBackgroundUrl(previousBackgroundUrl);
      setSelectedBackgroundPath(previousBackgroundPath);
      setBackgroundDuration(previousBackgroundDuration);
      setProjectStatus(previousProjectStatus);

      let errorMessage = textFor(
        "배경 영상 길이를 확인하지 못했습니다.",
        "Could not check background video length."
      );

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      setStepNotice(3, errorMessage);
    } finally {
    }
  }

  async function handleDeletedSelectedBackground() {
    setSelectedBackgroundUrl("");
    setSelectedBackgroundPath("");
    setBackgroundDuration(null);
    setProjectStatus("audio_ready");
    setMaxReachedStep(3);

    setStepNotice(
      3,
      textFor(
        "선택된 배경 영상이 삭제되었습니다. 다른 배경 영상을 선택해주세요.",
        "The selected background video was deleted. Choose another background video."
      )
    );

    try {
      await saveProjectSnapshot({
        title: getSafeProjectTitle(),
        topic: topic.trim() || null,
        script: script.trim() || null,
        voice,
        audio_path: audioPath || null,
        audio_url: audioUrl || null,
        audio_duration: audioDuration,
        background_path: null,
        background_url: null,
        background_duration: null,
        final_video_path: finalVideoPath || null,
        final_video_url: finalVideoUrl || null,
        final_video_size: finalVideoSize,
        timed_captions: timedCaptions.length > 0 ? timedCaptions : null,
        status: "audio_ready",
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        setStepNotice(3, error.message);
      }
    }
  }

  function markFinalVideoStaleAfterBackgroundOptionChange() {
    setProjectStatus(selectedBackgroundUrl ? "background_selected" : "audio_ready");
    setMaxReachedStep(3);
    setStepNotices((prev) => ({
      ...prev,
      3: textFor(
        "배경 영상 옵션이 바뀌었습니다. 새 설정으로 영상을 다시 만들어주세요.",
        "Background video options changed. Render the video again with the new settings."
      ),
      4: "",
    }));
  }

  function handleVisualModeChange(nextMode: "background" | "images") {
    if (nextMode === visualMode) return;

    setVisualMode(nextMode);
    setProjectStatus(nextMode === "images" ? "audio_ready" : "background_selected");
    setMaxReachedStep(3);
    setStepNotices((previous) => ({
      ...previous,
      3: textFor(
        "영상 소스 방식을 바꿨습니다. 새 설정으로 영상을 생성해주세요.",
        "Visual source changed. Render the video with the new setting."
      ),
      4: "",
    }));
  }

  function handleBackgroundPlaybackSpeedChange(speed: number) {
    const safeSpeed = Math.min(5, Math.max(0.5, speed));

    if (backgroundPlaybackSpeed === safeSpeed && !isBackgroundSpeedFit) return;

    setIsBackgroundSpeedFit(false);
    setBackgroundPlaybackSpeed(safeSpeed);
    markFinalVideoStaleAfterBackgroundOptionChange();
  }

  function handleFitBackgroundSpeed() {
    if (!backgroundDuration || !audioDuration) {
      setStepNotice(
        3,
        textFor(
          "배경 영상과 음성 길이를 확인한 뒤 길이 맞춤 배속을 사용할 수 있습니다.",
          "Check both background and audio durations before using fit-to-length speed."
        )
      );
      return;
    }

    const fittedSpeed = Math.min(
      5,
      Math.max(0.5, Math.round((backgroundDuration / audioDuration) * 100) / 100)
    );

    if (backgroundPlaybackSpeed === fittedSpeed && isBackgroundSpeedFit) return;

    setIsBackgroundSpeedFit(true);
    setBackgroundPlaybackSpeed(fittedSpeed);
    markFinalVideoStaleAfterBackgroundOptionChange();
  }

  function handleBackgroundReverseChange(isReversed: boolean) {
    if (isBackgroundReversed === isReversed) return;

    setIsBackgroundReversed(isReversed);
    markFinalVideoStaleAfterBackgroundOptionChange();
  }

  function handleVideoVisualStyleChange(style: VideoVisualStyle) {
    if (videoVisualStyle === style) return;

    setVideoVisualStyle(style);
    markFinalVideoStaleAfterBackgroundOptionChange();
  }

  async function handleRenderVideo() {
    setRenderError("");
    const previousFinalVideoUrl = finalVideoUrl;
    const previousFinalVideoPath = finalVideoPath;
    const previousFinalVideoSize = finalVideoSize;

    if (!audioUrl) {
      const message = textFor("먼저 MP3 음성을 생성해주세요.", "Generate MP3 voice first.");
      setStepNotice(3, message);
      setRenderError(message);
      return;
    }

    if (timedCaptions.length === 0) {
      const message = textFor("먼저 음성 자막 싱크 분석을 완료해주세요.", "Complete voice caption sync first.");
      setStepNotice(3, message);
      setRenderError(message);
      return;
    }

    if (visualMode === "background" && !selectedBackgroundUrl) {
      const message = textFor("먼저 배경 영상을 선택해주세요.", "Choose a background video first.");
      setStepNotice(3, message);
      setRenderError(message);
      return;
    }

    if (!(await canSaveCompletedProject())) return;

    setIsRenderingVideo(true);

    setProjectStatus("background_selected");

    setStepNotice(
      3,
      textFor(
        visualMode === "images"
          ? "대본을 분석해 장면 이미지를 준비하고 쇼츠 영상을 만들고 있습니다..."
          : "자막 효과를 적용하고 쇼츠 영상을 합성하고 있습니다...",
        visualMode === "images"
          ? "Analyzing the script, preparing scene images, and composing the short..."
          : "Applying caption effects and composing the short..."
      )
    );

    let uploadedFinalVideoPath = "";
    let finalVideoSnapshotSaved = false;

    try {
      const user = await getCurrentUser();
      const currentProjectId = await ensureProjectId();
      const response = await fetch("/api/render-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualMode,
          visualStyle: videoVisualStyle,
          script,
          language,
          backgroundUrl: selectedBackgroundUrl,
          backgroundPlaybackSpeed,
          isBackgroundReversed,
          audioUrl,
          timedCaptions,
          captionEmphasis: getCaptionEmphasisPayload(),
          autoCreate: autoRunRef.current,
          projectId: currentProjectId,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        let data: unknown = null;
        try {
          data = responseText ? JSON.parse(responseText) : null;
        } catch {
          data = null;
        }
        const errorMessage = getApiErrorMessage(
          data,
          responseText.trim() || response.status === 502 || response.status === 503
            ? textFor(
                "영상 합성 서버가 응답을 중단했습니다. 잠시 후 다시 시도해주세요.",
                "The video renderer stopped responding. Please try again shortly."
              )
            : textFor("영상 합성에 실패했습니다.", "Could not render the video.")
        );
        setStepNotice(3, errorMessage);
        setRenderError(errorMessage);
        if (autoRunRef.current) finishAutoRunWithError(errorMessage);
        return;
      }

      setStepNotice(3, textFor("완성 영상을 정리하고 있습니다...", "Preparing the final video..."));
      setManualGenerationProgress(94);

      const responseContentType = response.headers.get("content-type") ?? "";
      const storedVideo = responseContentType.includes("application/json")
        ? ((await response.json()) as {
            finalVideoPath?: unknown;
            finalVideoUrl?: unknown;
            finalVideoSize?: unknown;
            generatedImageCount?: unknown;
            skippedImageCount?: unknown;
          })
        : null;
      const generatedImageCount = Number(
        storedVideo?.generatedImageCount ??
          response.headers.get("X-Shate-Generated-Images") ??
          "0"
      );
      const skippedImageCount = Number(
        storedVideo?.skippedImageCount ??
          response.headers.get("X-Shate-Skipped-Images") ??
          "0"
      );
      if (visualMode === "images") {
        setSceneImageSummary(
          textFor(
            `AI 생성 이미지 ${generatedImageCount}장${
              skippedImageCount > 0 ? `, 건너뜀 ${skippedImageCount}장` : ""
            }`,
            `${generatedImageCount} AI-generated image${
              skippedImageCount > 0 ? `, ${skippedImageCount} skipped` : ""
            }`
          )
        );
      }

      const serverStoredVideo =
        typeof storedVideo?.finalVideoPath === "string" &&
        typeof storedVideo.finalVideoUrl === "string" &&
        typeof storedVideo.finalVideoSize === "number"
          ? {
              path: storedVideo.finalVideoPath,
              url: storedVideo.finalVideoUrl,
              size: storedVideo.finalVideoSize,
            }
          : null;
      const videoBlob = serverStoredVideo ? null : await response.blob();
      const completedVideoSize = serverStoredVideo?.size ?? videoBlob?.size ?? 0;
      setManualGenerationProgress(96);

      const fileName = `final-${createFileToken()}.mp4`;
      const filePath =
        serverStoredVideo?.path ?? `${user.id}/${currentProjectId}/${fileName}`;

      setStepNotice(3, textFor("완성 영상을 저장하고 있습니다...", "Saving the final video..."));
      setManualGenerationProgress(98);

      if (videoBlob) {
        await ensureStorageBucket("final-videos");

        const { error: uploadError } = await supabase.storage
          .from("final-videos")
          .upload(filePath, videoBlob, {
            contentType: "video/mp4",
          });

        if (uploadError) {
          setStepNotice(3, uploadError.message);
          setRenderError(uploadError.message);
          if (autoRunRef.current) finishAutoRunWithError(uploadError.message);
          return;
        }
      }

      uploadedFinalVideoPath = filePath;

      const publicFinalVideoUrl =
        serverStoredVideo?.url ??
        supabase.storage.from("final-videos").getPublicUrl(filePath).data.publicUrl;

      setFinalVideoUrl(publicFinalVideoUrl);
      setFinalVideoPath(filePath);
      setFinalVideoSize(completedVideoSize);

      await saveProjectSnapshot({
        title: getSafeProjectTitle(),
        topic: topic.trim() || null,
        script: script.trim() || null,
        voice,
        audio_path: audioPath || null,
        audio_url: audioUrl || null,
        audio_duration: audioDuration,
        background_path: visualMode === "images" ? "__auto_images__" : selectedBackgroundPath || null,
        background_url: visualMode === "images" ? null : selectedBackgroundUrl || null,
        background_duration: backgroundDuration,
        final_video_path: filePath,
        final_video_url: publicFinalVideoUrl,
        final_video_size: completedVideoSize,
        timed_captions: timedCaptions.length > 0 ? timedCaptions : null,
        status: "completed",
      });

      finalVideoSnapshotSaved = true;
      markScriptOutputsCurrent();
      setProjectStatus("completed");
      setManualGenerationProgress(100);

      if (
        previousFinalVideoPath &&
        previousFinalVideoPath !== uploadedFinalVideoPath
      ) {
        try {
          await removeGeneratedFile("final-videos", previousFinalVideoPath);
        } catch (cleanupError) {
          console.warn("Previous final video cleanup failed", cleanupError);
        }
      }

      clearStepNotice(3);
      setRenderError("");

      setMaxReachedStep(4);
      revealNextStep();
      if (autoRunRef.current) setAutoStage("publish");
    } catch (error: unknown) {
      let message = textFor(
        "영상 생성 중 오류가 발생했습니다.",
        "An error occurred while creating the video."
      );

      if (error instanceof Error) {
        message = error.message;
      }

      if (uploadedFinalVideoPath && !finalVideoSnapshotSaved) {
        try {
          await removeGeneratedFile("final-videos", uploadedFinalVideoPath);
          setFinalVideoUrl(previousFinalVideoUrl);
          setFinalVideoPath(previousFinalVideoPath);
          setFinalVideoSize(previousFinalVideoSize);
        } catch (cleanupError: unknown) {
          const cleanupMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : textFor(
                  "업로드된 최종 영상 파일 정리에 실패했습니다.",
                  "Could not clean up the uploaded final video."
                );

          message = `${message} ${textFor(
            "업로드된 최종 영상 파일 정리도 실패했습니다:",
            "Uploaded final video cleanup also failed:"
          )} ${cleanupMessage}`;
        }
      }

      setStepNotice(3, message);
      setRenderError(message);
      if (autoRunRef.current) finishAutoRunWithError(message);
    } finally {
      setIsRenderingVideo(false);
    }
  }

  function finishAutoRunWithError(message: string) {
    autoRunRef.current = false;
    setAutoFailureStage(autoStage);
    setIsAutoWidgetExpanded(true);
    setAutoStage("error");
    setStepNotice(4, message);
  }

  async function publishAutoProject() {
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId || !finalVideoUrl) {
      finishAutoRunWithError(
        textFor("자동 게시할 완성 영상이 없습니다.", "No final video is available for automatic publishing.")
      );
      return;
    }

    setAutoStage("publishing");
    setStepNotice(4, textFor("YouTube에 게시 요청을 보내고 있습니다...", "Sending the YouTube publish request..."));

    try {
      const response = await fetch("/api/youtube/auto-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProjectId,
          videoUrl: finalVideoUrl,
          title: getSafeProjectTitle(),
          description: topic.trim() || getSafeProjectTitle(),
          privacyStatus: autoPrivacyStatus,
          pinnedComment: initialYouTubePinnedComment.trim(),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : textFor("YouTube 게시 요청에 실패했습니다.", "Could not request YouTube publishing.")
        );
      }

      autoRunRef.current = false;
      setAutoStage("done");
      setCurrentStep(4);
      setStepNotice(
        4,
        textFor("완성 영상 저장과 YouTube 게시 요청이 완료되었습니다.", "Final video saved and YouTube publishing requested.")
      );
      addClientNotification({
        id: `auto-create-complete-${currentProjectId}`,
        type: "action",
        title: textFor("자동 제작 완료", "Auto-create complete"),
        message: textFor(
          "영상 제작과 YouTube 게시 요청이 완료되었습니다.",
          "The video and YouTube publish request are complete."
        ),
        actionHref: `/create?projectId=${currentProjectId}&step=4`,
        actionLabel: textFor("결과 보기", "View result"),
      });
      if (pathname === "/dashboard") router.refresh();
    } catch (error: unknown) {
      finishAutoRunWithError(
        error instanceof Error
          ? error.message
          : textFor("YouTube 게시 요청에 실패했습니다.", "Could not request YouTube publishing.")
      );
    }
  }

  async function selectRandomBackgroundForAutomation() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error(textFor("로그인이 필요합니다.", "Sign in is required."));
    }

    const { data, error } = await supabase.storage
      .from("background-videos")
      .list(user.id);

    if (error) throw new Error(error.message);

    const videos = (data ?? []).filter((item) => /\.(mp4|mov|webm)$/i.test(item.name));
    if (videos.length === 0) {
      throw new Error(
        textFor(
          "프로필에 업로드한 배경 영상이 없습니다. 자동 장면 생성을 선택하거나 배경 영상을 먼저 올려주세요.",
          "No personal background videos are available. Choose auto-generated scenes or upload a background video first."
        )
      );
    }

    const selected = videos[Math.floor(Math.random() * videos.length)];
    const path = `${user.id}/${selected.name}`;
    const { data: publicUrlData } = supabase.storage
      .from("background-videos")
      .getPublicUrl(path);

    setSelectedBackgroundPath(path);
    setSelectedBackgroundUrl(publicUrlData.publicUrl);
    setBackgroundDuration(null);
  }

  function startProAutomation(
    nextVisualMode: "background" | "images" = automationVisualMode,
    requestedTopic = ""
  ) {
    if (!initialCanRunAutomation) return;

    cancelScheduledScriptSave();
    syncProjectId("");
    setProjectTitle("");
    setTopic(requestedTopic.trim());
    setScriptDurationSeconds(initialScriptDurationSeconds);
    setLanguage(initialScriptLanguage);
    setScript("");
    setVoice(
      initialAutoVoice === "random"
        ? AUTOMATION_VOICES[Math.floor(Math.random() * AUTOMATION_VOICES.length)]
        : initialAutoVoice
    );
    setCaptionEmphasisPoints([]);
    setAudioUrl("");
    setAudioPath("");
    setAudioDuration(null);
    setTimedCaptions([]);
    setSelectedBackgroundUrl("");
    setSelectedBackgroundPath("");
    setBackgroundDuration(null);
    setVideoVisualStyle(initialVideoVisualStyle);
    setBackgroundPlaybackSpeed(initialBackgroundPlaybackSpeed);
    setIsBackgroundSpeedFit(initialBackgroundSpeedFit);
    setIsBackgroundReversed(initialBackgroundReversed);
    setFinalVideoUrl("");
    setFinalVideoPath("");
    setFinalVideoSize(null);
    setSceneImageSummary("");
    setProjectStatus("draft");
    setMaxReachedStep(1);
    setHasScriptChangedAfterOutputs(false);

    autoRunRef.current = true;
    setAutoFailureStage("idle");
    setIsAutoWidgetExpanded(false);
    setAutomationVisualMode(nextVisualMode);
    setVisualMode(nextVisualMode);
    setCurrentStep(1);
    setAutoStage("script");
    setStepNotices({
      1: textFor("자동 제작을 시작합니다...", "Starting automation..."),
      2: "",
      3: "",
      4: "",
    });
  }

  useEffect(() => {
    if (
      !initialStartProAutomation ||
      !initialCanRunAutomation ||
      requestedAutoRunRef.current
    ) {
      return;
    }

    requestedAutoRunRef.current = true;
    startProAutomation(initialAutoVisualMode, initialAutomationTopic);
    // This is an entry-point action, not a reactive automation setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCanRunAutomation, initialStartProAutomation]);

  useEffect(() => {
    if (!enableGlobalAutomation) return;

    const handleGlobalAutomationStart = (event: Event) => {
      if (autoRunRef.current) return;

      const detail = (event as CustomEvent<{
        visual?: unknown;
        topic?: unknown;
      }>).detail;
      const nextVisualMode =
        detail?.visual === "background" ? "background" : "images";
      const nextTopic = typeof detail?.topic === "string" ? detail.topic : "";

      requestedAutoRunRef.current = true;
      startProAutomation(nextVisualMode, nextTopic);
    };

    window.addEventListener("shate:auto-create", handleGlobalAutomationStart);
    return () =>
      window.removeEventListener("shate:auto-create", handleGlobalAutomationStart);
    // The handler intentionally uses the active automation state at dispatch time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableGlobalAutomation]);

  useEffect(() => {
    if (!autoRunRef.current) return;

    if (autoStage === "background") {
      const timeoutId = window.setTimeout(() => {
        void selectRandomBackgroundForAutomation()
          .then(() => setAutoStage("render"))
          .catch((error: unknown) =>
            finishAutoRunWithError(
              error instanceof Error
                ? error.message
                : textFor("배경 영상을 선택하지 못했습니다.", "Could not select a background video.")
            )
          );
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (autoStage === "script") {
      const timeoutId = window.setTimeout(() => {
        setAutoStage("script-running");
        void handleGenerateScript({ preventDefault: () => undefined } as never);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (autoStage === "voice" && script.trim()) {
      const timeoutId = window.setTimeout(() => {
        setAutoStage("voice-running");
        setCurrentStep(2);
        void handleGenerateTTSFile();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (autoStage === "render" && audioUrl && timedCaptions.length > 0) {
      if (
        automationVisualMode === "background" &&
        !selectedBackgroundUrl
      ) {
        const timeoutId = window.setTimeout(() => {
          setAutoStage("background");
        }, 0);
        return () => window.clearTimeout(timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        setAutoStage("rendering");
        setCurrentStep(3);
        void handleRenderVideo();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (autoStage === "publish" && finalVideoUrl) {
      const timeoutId = window.setTimeout(() => {
        void publishAutoProject();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
    // The stage value is the trigger. Handlers intentionally use the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStage, audioUrl, finalVideoUrl, script, timedCaptions.length]);

  const autoProgress: Record<AutoStage, number> = {
    idle: 0,
    background: 52,
    script: 5,
    "script-running": 18,
    voice: 28,
    "voice-running": 42,
    render: 52,
    rendering: 72,
    finalize: 82,
    finalizing: 88,
    publish: 94,
    publishing: 97,
    done: 100,
    error: 0,
  };
  const autoProgressLabel: Record<AutoStage, string> = {
    idle: "",
    background: textFor("배경 영상 선택", "Selecting background video"),
    script: textFor("대본 준비", "Preparing script"),
    "script-running": textFor("대본 생성", "Generating script"),
    voice: textFor("음성 준비", "Preparing voice"),
    "voice-running": textFor("음성 생성", "Generating voice"),
    render: textFor("영상 준비", "Preparing video"),
    rendering: textFor("영상 생성", "Generating video"),
    finalize: textFor("저장 준비", "Preparing save"),
    finalizing: textFor("저장", "Saving"),
    publish: textFor("게시 준비", "Preparing publish"),
    publishing: textFor("YouTube 게시", "Publishing to YouTube"),
    done: textFor("완료", "Complete"),
    error: textFor("중단됨", "Stopped"),
  };
  const showAutoProgress = autoStage !== "idle";
  const isAutoRunInProgress =
    showAutoProgress && autoStage !== "done" && autoStage !== "error";

  useEffect(() => {
    if (autoStage !== "done") return;

    const collapseTimeoutId = window.setTimeout(
      () => setIsAutoWidgetExpanded(false),
      0
    );
    const timeoutId = window.setTimeout(() => setAutoStage("idle"), 2_500);
    return () => {
      window.clearTimeout(collapseTimeoutId);
      window.clearTimeout(timeoutId);
    };
  }, [autoStage]);

  const manualGeneration: ManualGeneration | null = isGeneratingScript
    ? {
        key: "script",
        step: 1,
        label: textFor("대본 생성", "Generating script"),
        initialProgress: 10,
        increment: 5,
      }
    : isGeneratingTTS
      ? {
          key: "voice",
          step: 2,
          label: textFor("음성 생성", "Generating voice"),
          initialProgress: 12,
          increment: 4,
        }
      : isAnalyzingCaptionEmphasis
        ? {
            key: "captions",
            step: 2,
            label: textFor("캡션 효과 분석", "Analyzing caption effects"),
            initialProgress: 18,
            increment: 5,
          }
      : isRenderingVideo
        ? {
            key: "video",
            step: 3,
            label:
              visualMode === "images"
                ? textFor("대본 분석 및 영상 합성", "Analyzing script and rendering video")
                : textFor("영상 합성", "Rendering video"),
            initialProgress: 8,
            increment: 2,
          }
        : null;
  const manualGenerationKey = manualGeneration?.key;

  useEffect(() => {
    if (!manualGeneration) return;

    const initialTimer = window.setTimeout(() => {
      setManualGenerationProgress(manualGeneration.initialProgress);
    }, 0);
    const timer = window.setInterval(() => {
      setManualGenerationProgress((current) =>
        Math.min(
          manualGeneration.key === "video" ? 88 : 92,
          current + manualGeneration.increment
        )
      );
    }, 1_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
    // The task key only changes when a distinct creation action starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualGenerationKey]);

  const isScriptGenerated =
    scriptMode === "auto" &&
    Boolean(script.trim()) &&
    maxReachedStep >= 2 &&
    !hasScriptChangedAfterOutputs &&
    !isGeneratingScript;

  const isAudioGenerated =
    Boolean(audioUrl) &&
    timedCaptions.length > 0 &&
    maxReachedStep >= 3 &&
    !hasScriptChangedAfterOutputs &&
    !isGeneratingTTS;

  const isVideoRendered =
    Boolean(finalVideoUrl) &&
    maxReachedStep >= 4 &&
    !hasScriptChangedAfterOutputs &&
    !isRenderingVideo;

  if (isLoadingProject) {
    return (
      <div
        className="mx-auto w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        style={{ maxWidth: "var(--app-header-max-width)" }}
      >
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (headless) {
    if (!showAutoProgress) return null;

    const autoFailureMessage =
      autoStage === "error"
        ? stepNotices[4] || stepNotices[3] || stepNotices[2] || stepNotices[1]
        : "";
    const failureStageLabel: Record<AutoStage, string> = {
      idle: "",
      background: textFor("배경 영상 선택", "Background selection"),
      script: textFor("대본 준비", "Script preparation"),
      "script-running": textFor("대본 생성", "Script generation"),
      voice: textFor("음성 준비", "Voice preparation"),
      "voice-running": textFor("음성 생성", "Voice generation"),
      render: textFor("영상 준비", "Video preparation"),
      rendering: textFor("영상 생성", "Video generation"),
      finalize: textFor("저장 준비", "Save preparation"),
      finalizing: textFor("저장", "Saving"),
      publish: textFor("게시 준비", "Publish preparation"),
      publishing: textFor("YouTube 게시", "YouTube publishing"),
      done: textFor("완료", "Complete"),
      error: textFor("오류", "Error"),
    };

    const progressColor =
      autoStage === "error"
        ? "#ef4444"
        : autoStage === "done"
          ? "#10b981"
          : "#172033";
    const circumference = 2 * Math.PI * 31;
    const dashOffset = circumference * (1 - autoProgress[autoStage] / 100);

    const dashboardProgressTarget =
      pathname !== "/dashboard" || typeof document === "undefined"
        ? null
        : document.getElementById("dashboard-auto-create-progress");
    const isInlineProgress = Boolean(dashboardProgressTarget);

    const progressWidget = (
      <div
        className={
          isInlineProgress
            ? "relative z-[90] flex"
            : "fixed bottom-48 right-5 z-[90]"
        }
        aria-live="polite"
      >
        {isAutoWidgetExpanded && autoStage !== "done" ? (
          <section
            className={`w-[min(340px,calc(100vw-2rem))] rounded-xl border px-4 py-3 shadow-xl ${
              isInlineProgress
                ? "fixed inset-x-4 bottom-4 z-[120] mx-auto sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-full sm:mt-3 sm:-translate-x-1/2"
                : "absolute bottom-full right-0 mb-3"
            } ${
              autoStage === "error"
                ? "border-red-200 bg-red-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-semibold text-slate-950">
                {textFor("자동 제작", "Auto-create")}
                <span className="ml-2 font-medium text-slate-500">
                  {autoProgressLabel[autoStage]}
                </span>
              </p>
              {autoStage === "error" ? (
                <button
                  type="button"
                  onClick={() => {
                    setAutoStage("idle");
                    setIsAutoWidgetExpanded(false);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 transition hover:border-slate-950 hover:text-slate-950"
                  aria-label={textFor("닫기", "Close")}
                >
                  X
                </button>
              ) : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-slate-950 transition-[width] duration-500"
                style={{ width: `${autoProgress[autoStage]}%`, backgroundColor: progressColor }}
              />
            </div>
            {autoFailureMessage ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-xs leading-5 text-red-700">
                <p className="font-semibold">
                  {textFor("중단 단계", "Stopped at")}: {failureStageLabel[autoFailureStage]}
                </p>
                <p className="mt-1 break-words">{autoFailureMessage}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => setIsAutoWidgetExpanded((value) => !value)}
          disabled={autoStage === "done"}
          className={`relative grid place-items-center rounded-full border border-slate-200 bg-white transition hover:-translate-y-0.5 ${
            isInlineProgress
              ? "h-10 w-10 shadow-sm hover:shadow-md"
              : "h-16 w-16 shadow-xl hover:shadow-2xl"
          } disabled:cursor-default disabled:hover:translate-y-0`}
          aria-label={textFor("자동 제작 진행 상태", "Auto-create progress")}
        >
          <svg viewBox="0 0 72 72" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="36" cy="36" r="31" fill="none" stroke="#e2e8f0" strokeWidth="4" />
            <circle
              cx="36"
              cy="36"
              r="31"
              fill="none"
              stroke={progressColor}
              strokeLinecap="round"
              strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <span
            className={`relative font-bold tabular-nums text-slate-950 ${
              isInlineProgress ? "text-[10px]" : "text-sm"
            }`}
          >
            {autoProgress[autoStage]}%
          </span>
        </button>
      </div>
    );

    return dashboardProgressTarget
      ? createPortal(progressWidget, dashboardProgressTarget)
      : progressWidget;
  }

  return (
    <div
      className="mx-auto w-full"
      style={{ maxWidth: "var(--app-header-max-width)" }}
    >
      <AppHeader
        locale={initialLocale}
        attachedFooter
        center={
          <div className="min-w-0">
            <Input
              type="text"
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              placeholder={siteText.create.projectPlaceholder}
              aria-label={siteText.create.projectLabel}
              className="min-w-0 bg-white"
            />
          </div>
        }
      />

      <StepProgress
        currentStep={currentStep}
        labels={siteText.create.stepHeader.progress}
      />

      {showAutoProgress ? (
        <section
          className={`mb-4 rounded-xl border px-4 py-3 shadow-sm ${
            autoStage === "error"
              ? "border-red-200 bg-red-50"
              : autoStage === "done"
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-white"
          }`}
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-slate-950">
              {textFor("자동 제작", "Auto-create")}
              <span className="ml-2 font-medium text-slate-500">
                {autoProgressLabel[autoStage]}
              </span>
            </p>
            <strong className="tabular-nums text-slate-950">
              {autoProgress[autoStage]}%
            </strong>
            {autoStage === "error" || autoStage === "done" ? (
              <button
                type="button"
                onClick={() => setAutoStage("idle")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 transition hover:border-slate-950 hover:text-slate-950"
                aria-label={textFor("닫기", "Close")}
              >
                X
              </button>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                autoStage === "error"
                  ? "bg-red-500"
                  : autoStage === "done"
                    ? "bg-emerald-500"
                    : "bg-slate-950"
              }`}
              style={{ width: `${autoProgress[autoStage]}%` }}
            />
          </div>
        </section>
      ) : null}

      {manualGeneration && !showAutoProgress ? (
        <section
          className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-slate-950">
              {manualGeneration.label}
              <span className="ml-2 font-medium text-slate-500">
                {stepNotices[manualGeneration.step] || textFor("처리 중", "Working")}
              </span>
            </p>
            <strong className="tabular-nums text-slate-950">
              {manualGenerationProgress}%
            </strong>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-950 transition-[width] duration-500"
              style={{ width: `${manualGenerationProgress}%` }}
            />
          </div>
        </section>
      ) : null}

      {!isAutoRunInProgress ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div>
            {sourceVideoUrl && (
              <SourceVideoReferenceCard
                sourceVideoName={sourceVideoName}
                sourceVideoDurationText={
                  sourceVideoDuration !== null
                    ? formatDuration(sourceVideoDuration)
                    : ""
                }
                labels={siteText.create.sourceReference}
              />
            )}

            <CreateStepHeader
              currentStep={currentStep}
              maxReachedStep={maxReachedStep}
              labels={siteText.create.stepHeader}
              isNavigating={isStepNavigating}
              nextStepRevealToken={nextStepRevealToken}
              exitLabel={textFor("나가기", "Exit")}
              onPrevStep={goPrevStep}
              onNextStep={goNextStep}
              onExit={() => void saveAndGoDashboard()}
            />

            <div className="overflow-hidden">
              <div className="flex">
                {currentStep === 1 && (
                  <ScriptStep
                    scriptMode={scriptMode}
                    topic={topic}
                    script={script}
                    durationSeconds={scriptDurationSeconds}
                    language={language}
                    labels={siteText.create.scriptStep}
                    isGeneratingScript={isGeneratingScript}
                    isScriptGenerated={isScriptGenerated}
                    onScriptModeChange={handleScriptModeChange}
                    onTopicChange={handleTopicChange}
                    onDurationChange={handleDurationChange}
                    onLanguageChange={handleLanguageChange}
                    onScriptChange={(value) => handleScriptChange(value, 1)}
                    onGenerateScript={handleGenerateScript}
                  />
                )}

                {currentStep === 2 && (
                  <VoiceStep
                    script={script}
                    voice={voice}
                    labels={{
                      ...siteText.create.voiceStep,
                      captionEffects: siteText.create.captionEffects,
                    }}
                    isGeneratingTTS={isGeneratingTTS}
                    isAudioGenerated={isAudioGenerated}
                    captionEmphasisPoints={captionEmphasisPoints}
                    isAnalyzingCaptionEmphasis={isAnalyzingCaptionEmphasis}
                    onScriptChange={(value) => handleScriptChange(value, 2)}
                    onVoiceChange={handleVoiceChange}
                    onGenerateTTS={handleGenerateTTSFile}
                    onAnalyzeCaptionEmphasis={() =>
                      void analyzeCaptionEmphasisForScript(script, 2)
                    }
                    onAddCaptionEmphasis={handleAddCaptionEmphasis}
                    onRemoveCaptionEmphasis={handleRemoveCaptionEmphasis}
                    onToggleCaptionEmphasis={handleToggleCaptionEmphasis}
                    onCaptionEmphasisTextChange={handleCaptionEmphasisTextChange}
                    onCaptionEmphasisEffectChange={
                      handleCaptionEmphasisEffectChange
                    }
                  />
                )}

                {currentStep === 3 && (
                  <BackgroundStep
                    locale={initialLocale}
                    visualMode={visualMode}
                    videoVisualStyle={videoVisualStyle}
                    selectedBackgroundPath={selectedBackgroundPath}
                    backgroundPlaybackSpeed={backgroundPlaybackSpeed}
                    isBackgroundSpeedFit={isBackgroundSpeedFit}
                    canFitBackgroundSpeed={
                      Boolean(backgroundDuration) && Boolean(audioDuration)
                    }
                    isBackgroundReversed={isBackgroundReversed}
                    isRenderingVideo={isRenderingVideo}
                    renderError={renderError}
                    hasTimedCaptions={timedCaptions.length > 0}
                    hasSelectedBackground={Boolean(selectedBackgroundUrl)}
                    hasRenderedVideo={isVideoRendered}
                    labels={{
                      ...siteText.create.backgroundStep,
                      picker: {
                        ...siteText.create.backgroundPicker,
                        randomSelect: textFor("내 영상 랜덤", "Random my video"),
                      },
                      visualModeVideo: textFor("배경 영상", "Background video"),
                      visualModeImages: textFor("자동 생성", "Auto generate"),
                      visualStyleLabel: textFor("영상 스타일", "Visual style"),
                      visualModeImagesHelp: textFor(
                        "대본의 핵심 장면만 AI 이미지로 만들고 자막 구간에 맞춰 이어 붙입니다.",
                        "Generates AI images only for key script moments and aligns them with caption segments."
                      ),
                      renderCreditCost: textFor(
                        visualMode === "images"
                          ? "자동 생성 영상: 50 크레딧"
                          : "영상 합성: 2 크레딧",
                        visualMode === "images"
                          ? "Auto-generated video: 50 credits"
                          : "Video render: 2 credits"
                      ),
                    }}
                    onVisualModeChange={handleVisualModeChange}
                    onVideoVisualStyleChange={handleVideoVisualStyleChange}
                    onSelectBackground={handleSelectBackground}
                    onDeletedSelectedBackground={handleDeletedSelectedBackground}
                    onFitBackgroundSpeed={handleFitBackgroundSpeed}
                    onBackgroundPlaybackSpeedChange={
                      handleBackgroundPlaybackSpeedChange
                    }
                    onBackgroundReverseChange={handleBackgroundReverseChange}
                    onRenderVideo={handleRenderVideo}
                  />
                )}

                {currentStep === 4 && (
                  <FinalStep
                    projectId={projectId}
                    projectTitle={getSafeProjectTitle()}
                    finalVideoUrl={finalVideoUrl}
                    youtubeChannelTitle={initialYouTubeChannelTitle}
                    isYouTubeConnected={initialIsYouTubeConnected}
                    canPublishToYouTube={initialCanPublishToYouTube}
                    initialYouTubePrivacy={initialYouTubePrivacy}
                    initialYouTubePinnedComment={initialYouTubePinnedComment}
                    initialYouTubePublishEvent={initialYouTubePublishEvent}
                    locale={initialLocale}
                    labels={{ empty: siteText.create.finalStep.empty }}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:h-fit">
          <DeferredResultPreviewPanel
            currentStep={currentStep}
            showAllResults={showAllResults}
            previewTitle={getPreviewTitle()}
            script={script}
            audioUrl={audioUrl}
            audioDurationText={
              audioDuration !== null
                ? formatDuration(audioDuration)
                : textFor("확인 중", "Checking")
            }
            timedCaptions={timedCaptions}
            selectedBackgroundUrl={selectedBackgroundUrl}
            backgroundDurationText={
              backgroundDuration !== null
                ? formatDuration(backgroundDuration)
                : ""
            }
            finalVideoUrl={finalVideoUrl}
            sourceVideoName={sourceVideoName}
            sourceVideoUrl={sourceVideoUrl}
            sourceVideoDurationText={
              sourceVideoDuration !== null ? formatDuration(sourceVideoDuration) : ""
            }
            labels={siteText.create.preview}
            onToggleShowAll={() => setShowAllResults((prev) => !prev)}
          />

        </aside>
        </div>
      ) : null}
    </div>
  );
}


