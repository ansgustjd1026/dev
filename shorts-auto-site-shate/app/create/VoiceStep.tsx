import Button from "@/app/components/ui/Button";
import Textarea from "@/app/components/ui/Textarea";
import { useState } from "react";
import type { CaptionEffect } from "@/lib/captions/effects";
import type { CaptionEmphasisPoint } from "@/lib/captions/emphasis";
import CaptionEmphasisEditor from "./CaptionEmphasisEditor";
import CaptionEmphasisScriptPreview from "./CaptionEmphasisScriptPreview";

type Props = {
  script: string;
  voice: string;
  labels: {
    title: string;
    scriptPlaceholder: string;
    scriptEditorTitle: string;
    voiceLabel: string;
    generate: string;
    generating: string;
    generated: string;
    captionEffects: {
      title: string;
      previewTitle: string;
      itemLabel: (index: number) => string;
      effectLabel: string;
      analyze: string;
      analyzing: string;
      add: string;
      empty: string;
      placeholder: string;
      remove: string;
      highlightCount: (count: number) => string;
      noScript: string;
      effectNames: Record<CaptionEffect, string>;
    };
  };
  isGeneratingTTS: boolean;
  isAudioGenerated: boolean;
  captionEmphasisPoints: CaptionEmphasisPoint[];
  isAnalyzingCaptionEmphasis: boolean;
  onScriptChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onGenerateTTS: () => void;
  onAnalyzeCaptionEmphasis: () => void;
  onAddCaptionEmphasis: () => void;
  onRemoveCaptionEmphasis: (id: string) => void;
  onToggleCaptionEmphasis: (id: string) => void;
  onCaptionEmphasisTextChange: (id: string, value: string) => void;
  onCaptionEmphasisEffectChange: (id: string, effect: CaptionEffect) => void;
};

type VoicePanel = "script" | "captions";

const VOICE_OPTIONS = ["nova", "shimmer", "echo", "onyx", "fable", "alloy"];
const SCRIPT_MAX_LENGTH = 3000;

function getScriptRows(script: string) {
  const lines = script.split(/\r\n|\r|\n/);
  const estimatedRows = lines.reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / 72));
  }, 0);

  return Math.max(6, estimatedRows + 1);
}

export default function VoiceStep({
  script,
  voice,
  labels,
  isGeneratingTTS,
  isAudioGenerated,
  captionEmphasisPoints,
  isAnalyzingCaptionEmphasis,
  onScriptChange,
  onVoiceChange,
  onGenerateTTS,
  onAnalyzeCaptionEmphasis,
  onAddCaptionEmphasis,
  onRemoveCaptionEmphasis,
  onToggleCaptionEmphasis,
  onCaptionEmphasisTextChange,
  onCaptionEmphasisEffectChange,
}: Props) {
  const [activePanel, setActivePanel] = useState<VoicePanel>("script");

  return (
    <div className="w-full shrink-0">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-2xl font-semibold">{labels.title}</h2>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setActivePanel("script")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              activePanel === "script"
                ? "bg-white text-black"
                : "text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {labels.scriptEditorTitle}
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("captions")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              activePanel === "captions"
                ? "bg-white text-black"
                : "text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {labels.captionEffects.title}
          </button>
        </div>

        {activePanel === "script" ? (
          <div className="mt-4">
            <Textarea
              className="resize-none overflow-hidden"
              maxLength={SCRIPT_MAX_LENGTH}
              rows={getScriptRows(script)}
              value={script}
              onChange={(event) => onScriptChange(event.target.value)}
              placeholder={labels.scriptPlaceholder}
            />
          </div>
        ) : (
          <div className="mt-4">
            <CaptionEmphasisScriptPreview
              script={script}
              points={captionEmphasisPoints}
              labels={labels.captionEffects}
            />

            <CaptionEmphasisEditor
              points={captionEmphasisPoints}
              isAnalyzing={isAnalyzingCaptionEmphasis}
              canAnalyze={Boolean(script.trim())}
              labels={labels.captionEffects}
              onAnalyze={onAnalyzeCaptionEmphasis}
              onAdd={onAddCaptionEmphasis}
              onRemove={onRemoveCaptionEmphasis}
              onToggle={onToggleCaptionEmphasis}
              onTextChange={onCaptionEmphasisTextChange}
              onEffectChange={onCaptionEmphasisEffectChange}
            />
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block text-sm font-medium text-neutral-300">
          {labels.voiceLabel}
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {VOICE_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onVoiceChange(value)}
              className={`rounded-2xl px-3 py-2 text-center text-sm font-semibold transition ${
                voice === value
                  ? "bg-white text-black"
                  : "border border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/10"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={onGenerateTTS}
        disabled={isGeneratingTTS || isAudioGenerated || !script.trim()}
        fullWidth
        className="mt-4"
      >
        {isGeneratingTTS
          ? labels.generating
          : isAudioGenerated
            ? labels.generated
            : labels.generate}
      </Button>
    </div>
  );
}

