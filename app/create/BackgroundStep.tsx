import dynamic from "next/dynamic";
import Button from "@/app/components/ui/Button";
import InlineStatus from "@/app/components/ui/InlineStatus";
import type { SiteLocale } from "@/lib/i18n/config";
import {
  VIDEO_VISUAL_STYLE_OPTIONS,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";

type BackgroundVideo = {
  name: string;
  path: string;
  url: string;
  size?: number;
};

type BackgroundPickerLabels = {
    uploadLabel: string;
    uploadAction: string;
    randomSelect: string;
  recommendedTab: string;
  myTab: string;
  uploadLimit: (count: number, fileSize: number, storageSize: number) => string;
  loginRequired: string;
  maxFiles: (count: number) => string;
  maxSize: (size: number) => string;
  maxStorage: (size: number) => string;
  storageUsage: (used: string, total: number) => string;
  videoOnly: string;
  allowedTypes: string;
  uploading: string;
  uploaded: string;
  uploadError: string;
  duplicateName: string;
  confirmDelete: string;
  deleting: string;
  deleted: string;
  deleteError: string;
  selected: string;
  select: string;
  delete: string;
  deleteProgress: string;
  empty: string;
  globalEmpty: string;
};

type Props = {
  locale: SiteLocale;
  visualMode: "background" | "images";
  videoVisualStyle: VideoVisualStyle;
  selectedBackgroundPath: string;
  backgroundPlaybackSpeed: number;
  isBackgroundSpeedFit: boolean;
  canFitBackgroundSpeed: boolean;
  isBackgroundReversed: boolean;
  isRenderingVideo: boolean;
  renderError: string;
  hasTimedCaptions: boolean;
  hasSelectedBackground: boolean;
  hasRenderedVideo: boolean;
  labels: {
    title: string;
    loading: string;
    fitSpeedLabel: string;
    playbackSpeedLabel: string;
    reverseLabel: string;
    reverseOff: string;
    reverseOn: string;
    render: string;
    rendering: string;
    rendered: string;
    visualModeVideo: string;
    visualModeImages: string;
    visualModeImagesHelp: string;
    visualStyleLabel: string;
    renderCreditCost: string;
    picker: BackgroundPickerLabels;
  };
  onVisualModeChange: (mode: "background" | "images") => void;
  onVideoVisualStyleChange: (style: VideoVisualStyle) => void;
  onSelectBackground: (video: BackgroundVideo) => void;
  onDeletedSelectedBackground: () => void;
  onFitBackgroundSpeed: () => void;
  onBackgroundPlaybackSpeedChange: (speed: number) => void;
  onBackgroundReverseChange: (isReversed: boolean) => void;
  onRenderVideo: () => void;
};

const BACKGROUND_SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 5];

function BackgroundVideoPickerLoading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
      {children}
    </div>
  );
}

const BackgroundVideoPicker = dynamic(() => import("./BackgroundVideoPicker"), {
  loading: () => <BackgroundVideoPickerLoading>&nbsp;</BackgroundVideoPickerLoading>,
});

export default function BackgroundStep({
  locale,
  visualMode,
  videoVisualStyle,
  selectedBackgroundPath,
  backgroundPlaybackSpeed,
  isBackgroundSpeedFit,
  canFitBackgroundSpeed,
  isBackgroundReversed,
  isRenderingVideo,
  renderError,
  hasTimedCaptions,
  hasSelectedBackground,
  hasRenderedVideo,
  labels,
  onVisualModeChange,
  onVideoVisualStyleChange,
  onSelectBackground,
  onDeletedSelectedBackground,
  onFitBackgroundSpeed,
  onBackgroundPlaybackSpeedChange,
  onBackgroundReverseChange,
  onRenderVideo,
}: Props) {
  return (
    <div className="w-full shrink-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-[1.65rem] font-semibold sm:text-2xl">{labels.title}</h2>
        <div className="mt-4 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => onVisualModeChange("background")}
            disabled={isRenderingVideo}
              className={`h-9 rounded-lg px-2 text-sm font-semibold transition disabled:opacity-50 ${
              visualMode === "background"
                ? "bg-slate-950 text-slate-50"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            {labels.visualModeVideo}
          </button>
          <button
            type="button"
            onClick={() => onVisualModeChange("images")}
            disabled={isRenderingVideo}
              className={`h-9 rounded-lg px-2 text-sm font-semibold transition disabled:opacity-50 ${
              visualMode === "images"
                ? "bg-slate-950 text-slate-50"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            {labels.visualModeImages}
          </button>
        </div>
        {visualMode === "images" ? (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm leading-6 text-slate-600">
              {labels.visualModeImagesHelp}
            </p>
            <label className="mt-4 block text-sm font-semibold text-slate-800">
              {labels.visualStyleLabel}
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {VIDEO_VISUAL_STYLE_OPTIONS.map((option) => {
                const selected = videoVisualStyle === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={isRenderingVideo}
                    onClick={() => onVideoVisualStyleChange(option.value)}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition disabled:opacity-50 ${
                      selected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {locale === "ko" ? option.ko : option.en}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {visualMode === "background" ? (
        <>
          <BackgroundVideoPicker
            selectedVideoPath={selectedBackgroundPath}
            labels={labels.picker}
            onSelect={onSelectBackground}
            onDeletedSelected={onDeletedSelectedBackground}
          />

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-5 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-semibold text-slate-800">
              {labels.playbackSpeedLabel}
            </label>

            <div className="mt-3 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={onFitBackgroundSpeed}
                disabled={isRenderingVideo || !canFitBackgroundSpeed}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition disabled:opacity-50 sm:px-3 ${
                  isBackgroundSpeedFit
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white"
                }`}
              >
                {labels.fitSpeedLabel}
              </button>

              {BACKGROUND_SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => onBackgroundPlaybackSpeedChange(speed)}
                  disabled={isRenderingVideo}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition disabled:opacity-50 sm:px-3 ${
                  !isBackgroundSpeedFit && backgroundPlaybackSpeed === speed
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-44">
            <label className="block text-sm font-semibold text-slate-800">
              {labels.reverseLabel}
            </label>

            <button
              type="button"
              onClick={() => onBackgroundReverseChange(!isBackgroundReversed)}
              disabled={isRenderingVideo}
                className={`mt-3 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  isBackgroundReversed
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white"
              }`}
            >
              {isBackgroundReversed ? labels.reverseOn : labels.reverseOff}
            </button>
          </div>
        </div>
          </div>
        </>
      ) : null}

      <Button
        type="button"
        onClick={onRenderVideo}
        disabled={
          isRenderingVideo ||
          hasRenderedVideo ||
          !hasTimedCaptions ||
          !(visualMode === "images" || hasSelectedBackground)
        }
        fullWidth
        className="mt-5"
      >
        {isRenderingVideo
          ? labels.rendering
          : hasRenderedVideo
            ? labels.rendered
            : labels.render}
      </Button>
      <p className="mt-2 text-center text-xs text-slate-500">
        {labels.renderCreditCost}
      </p>
      {renderError ? (
        <InlineStatus tone="error" className="mt-3">
          {renderError}
        </InlineStatus>
      ) : null}
    </div>
  );
}

