"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { SiteLocale } from "@/lib/i18n/config";
import type {
  DefaultAutoVisualMode,
  DefaultBackgroundDirection,
  DefaultBackgroundPlaybackSpeed,
  DefaultScriptLanguage,
  DefaultVoice,
  DefaultYouTubePrivacy,
} from "@/lib/preferences/config";
import type { VideoVisualStyle } from "@/lib/visuals/styles";

type Props = {
  locale: SiteLocale;
  defaultScriptLanguage: DefaultScriptLanguage;
  defaultScriptDurationSeconds: number;
  defaultVoice: DefaultVoice;
  defaultYouTubePrivacy: DefaultYouTubePrivacy;
  defaultAutoVisualMode: DefaultAutoVisualMode;
  defaultVideoVisualStyle: VideoVisualStyle;
  defaultBackgroundPlaybackSpeed: DefaultBackgroundPlaybackSpeed;
  defaultBackgroundDirection: DefaultBackgroundDirection;
};

type AutomationFormProps = {
  initialLocale: SiteLocale;
  initialCanRunAutomation: boolean;
  initialCanPublishToYouTube: boolean;
  initialIsYouTubeConnected: boolean;
  initialScriptLanguage: DefaultScriptLanguage;
  initialScriptDurationSeconds: number;
  initialVoice: Exclude<DefaultVoice, "random">;
  initialAutoVoice: DefaultVoice;
  initialBackgroundPlaybackSpeed: number;
  initialBackgroundSpeedFit: boolean;
  initialBackgroundReversed: boolean;
  initialYouTubePrivacy: DefaultYouTubePrivacy;
  initialAutoVisualMode: DefaultAutoVisualMode;
  initialVideoVisualStyle: VideoVisualStyle;
  initialAutomationTopic: string;
  initialStartProAutomation: boolean;
  headless: boolean;
  enableGlobalAutomation: boolean;
};

// This stays mounted at the application root, so an active automation run can
// continue while the user navigates between Shate pages.
export default function GlobalAutoCreateHost({
  locale,
  defaultScriptLanguage,
  defaultScriptDurationSeconds,
  defaultVoice,
  defaultYouTubePrivacy,
  defaultAutoVisualMode,
  defaultVideoVisualStyle,
  defaultBackgroundPlaybackSpeed,
  defaultBackgroundDirection,
}: Props) {
  const [automationContext, setAutomationContext] = useState<{
    canRunAutomation: boolean;
    canPublishToYouTube: boolean;
    isYouTubeConnected: boolean;
  } | null>(null);
  const [requestedMode, setRequestedMode] = useState<
    DefaultAutoVisualMode | null
  >(null);
  const [requestedTopic, setRequestedTopic] = useState("");
  const [activationError, setActivationError] = useState("");
  const [AutomationForm, setAutomationForm] = useState<ComponentType<
    AutomationFormProps
  > | null>(null);

  useEffect(() => {
    const activateAutomation = async (event: Event) => {
      if (automationContext) return;

      const detail = (event as CustomEvent<{
        visual?: unknown;
        topic?: unknown;
      }>).detail;
      const mode = detail?.visual === "background" ? "background" : "images";
      const topic = typeof detail?.topic === "string" ? detail.topic.trim() : "";

      setActivationError("");
      setRequestedMode((current) => current ?? mode);
      setRequestedTopic(topic);

      try {
        const [response, formModule] = await Promise.all([
          fetch("/api/automation/context", { cache: "no-store" }),
          import("@/app/create/CreateProjectForm"),
        ]);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : locale === "ko"
                ? "자동 제작 정보를 불러오지 못했습니다."
                : "Could not load automation settings."
          );
        }

        setAutomationContext({
          canRunAutomation: data.canRunAutomation === true,
          canPublishToYouTube: data.canPublishToYouTube === true,
          isYouTubeConnected: data.isYouTubeConnected === true,
        });
        setAutomationForm(() => formModule.default);
      } catch (error) {
        setRequestedMode(null);
        setActivationError(
          error instanceof Error
            ? error.message
            : locale === "ko"
              ? "자동 제작을 시작하지 못했습니다."
              : "Could not start auto-create."
        );
      }
    };

    window.addEventListener("shate:auto-create", activateAutomation);
    return () =>
      window.removeEventListener("shate:auto-create", activateAutomation);
  }, [automationContext, locale]);

  if (activationError) {
    return (
      <div className="fixed bottom-5 right-5 z-[100] flex max-w-sm items-center gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-xl">
        <span>{activationError}</span>
        <button
          type="button"
          onClick={() => setActivationError("")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-red-200 font-semibold"
          aria-label={locale === "ko" ? "닫기" : "Close"}
        >
          X
        </button>
      </div>
    );
  }

  if (!requestedMode || !automationContext || !AutomationForm) return null;

  return (
    <AutomationForm
      initialLocale={locale}
      initialCanRunAutomation={automationContext.canRunAutomation}
      initialCanPublishToYouTube={automationContext.canPublishToYouTube}
      initialIsYouTubeConnected={automationContext.isYouTubeConnected}
      initialScriptLanguage={defaultScriptLanguage}
      initialScriptDurationSeconds={defaultScriptDurationSeconds}
      initialVoice={defaultVoice === "random" ? "nova" : defaultVoice}
      initialAutoVoice={defaultVoice}
      initialBackgroundPlaybackSpeed={
        defaultBackgroundPlaybackSpeed === "fit"
          ? 1
          : Number(defaultBackgroundPlaybackSpeed)
      }
      initialBackgroundSpeedFit={defaultBackgroundPlaybackSpeed === "fit"}
      initialBackgroundReversed={defaultBackgroundDirection === "reverse"}
      initialYouTubePrivacy={defaultYouTubePrivacy}
      initialAutoVisualMode={requestedMode || defaultAutoVisualMode}
      initialVideoVisualStyle={defaultVideoVisualStyle}
      initialAutomationTopic={requestedTopic}
      initialStartProAutomation
      headless
      enableGlobalAutomation
    />
  );
}
