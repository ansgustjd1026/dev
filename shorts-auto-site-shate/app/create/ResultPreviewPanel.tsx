import Surface from "@/app/components/ui/Surface";

type Step = 1 | 2 | 3 | 4;

type TimedCaption = {
  text: string;
  start: number;
  end: number;
};

export type ResultPreviewPanelProps = {
  currentStep: Step;
  showAllResults: boolean;
  previewTitle: string;
  script: string;
  audioUrl: string;
  audioDurationText: string;
  timedCaptions: TimedCaption[];
  selectedBackgroundUrl: string;
  backgroundDurationText: string;
  finalVideoUrl: string;
  sourceVideoName: string;
  sourceVideoUrl: string;
  sourceVideoDurationText: string;
  labels: PreviewLabels;
  onToggleShowAll: () => void;
};

type PreviewLabels = {
  scriptTitle: string;
  sourceTitle: string;
  audioTitle: string;
  backgroundTitle: string;
  finalTitle: string;
  noScript: string;
  noAudio: string;
  noBackground: string;
  noFinal: string;
  file: string;
  uploadedSourceVideo: string;
  duration: string;
  audioDuration: string;
  captionSyncData: string;
  countSuffix: string;
    backgroundDuration: string;
    toggleAria: string;
  currentOnly: string;
  all: string;
};

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-neutral-500">
      {children}
    </p>
  );
}

function ResultCard({
  title,
  showTitle = true,
  children,
}: {
  title: string;
  showTitle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner shadow-white/[0.02]">
      {showTitle && (
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
      )}
      {children}
    </div>
  );
}

function ResultScript({
  script,
  labels,
  showTitle,
}: {
  script: string;
  labels: PreviewLabels;
  showTitle?: boolean;
}) {
  return (
    <ResultCard title={labels.scriptTitle} showTitle={showTitle}>
      {script ? (
        <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-neutral-300">
          {script}
        </p>
      ) : (
        <EmptyState>{labels.noScript}</EmptyState>
      )}
    </ResultCard>
  );
}

function ResultSourceVideo({
  sourceVideoName,
  sourceVideoUrl,
  sourceVideoDurationText,
  labels,
  showTitle,
}: {
  sourceVideoName: string;
  sourceVideoUrl: string;
  sourceVideoDurationText: string;
  labels: PreviewLabels;
  showTitle?: boolean;
}) {
  if (!sourceVideoUrl) return null;

  return (
    <ResultCard title={labels.sourceTitle} showTitle={showTitle}>
      <div className="mx-auto mt-3 aspect-[9/16] w-full max-w-[162px] overflow-hidden rounded-2xl bg-black">
        <video
          src={sourceVideoUrl}
          controls
          playsInline
          className="h-full w-full object-cover"
        />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-neutral-400">
        <p className="truncate">
          {labels.file}: {sourceVideoName || labels.uploadedSourceVideo}
        </p>
        {sourceVideoDurationText && (
          <p>
            {labels.duration}: {sourceVideoDurationText}
          </p>
        )}
      </div>
    </ResultCard>
  );
}

function ResultAudio({
  audioUrl,
  audioDurationText,
  timedCaptions,
  labels,
  showTitle,
}: {
  audioUrl: string;
  audioDurationText: string;
  timedCaptions: TimedCaption[];
  labels: PreviewLabels;
  showTitle?: boolean;
}) {
  return (
    <ResultCard title={labels.audioTitle} showTitle={showTitle}>
      {audioUrl ? (
        <>
          <audio controls src={audioUrl} className="mt-3 w-full" />

          <div className="mt-3 grid gap-2 text-xs text-neutral-400">
            <p>
              {labels.audioDuration}: {audioDurationText}
            </p>
            <p>
              {labels.captionSyncData}: {timedCaptions.length}
              {labels.countSuffix}
            </p>
          </div>
        </>
      ) : (
        <EmptyState>{labels.noAudio}</EmptyState>
      )}
    </ResultCard>
  );
}

function ResultBackground({
  selectedBackgroundUrl,
  backgroundDurationText,
  labels,
  showTitle,
}: {
  selectedBackgroundUrl: string;
  backgroundDurationText: string;
  labels: PreviewLabels;
  showTitle?: boolean;
}) {
  return (
    <ResultCard title={labels.backgroundTitle} showTitle={showTitle}>
      {selectedBackgroundUrl ? (
        <>
          <div className="mx-auto mt-3 aspect-[9/16] w-full max-w-[162px] overflow-hidden rounded-2xl bg-black">
            <video
              src={selectedBackgroundUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          </div>

          {backgroundDurationText && (
            <p className="mt-3 text-xs text-neutral-400">
              {labels.backgroundDuration}: {backgroundDurationText}
            </p>
          )}
        </>
      ) : (
        <EmptyState>{labels.noBackground}</EmptyState>
      )}
    </ResultCard>
  );
}

function ResultFinalVideo({
  finalVideoUrl,
  labels,
  showTitle,
}: {
  finalVideoUrl: string;
  labels: PreviewLabels;
  showTitle?: boolean;
}) {
  const previewUrl = finalVideoUrl
    ? `${finalVideoUrl}${finalVideoUrl.includes("?") ? "&" : "?"}preview=burned-captions-v2`
    : "";

  return (
    <ResultCard title={labels.finalTitle} showTitle={showTitle}>
      {finalVideoUrl ? (
        <>
          <div className="mx-auto mt-3 aspect-[9/16] w-full max-w-[281px] overflow-hidden rounded-2xl bg-black">
            <video
              key={previewUrl}
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          </div>

        </>
      ) : (
        <EmptyState>{labels.noFinal}</EmptyState>
      )}
    </ResultCard>
  );
}

export default function ResultPreviewPanel({
  currentStep,
  showAllResults,
  previewTitle,
  script,
  audioUrl,
  audioDurationText,
  timedCaptions,
  selectedBackgroundUrl,
  backgroundDurationText,
  finalVideoUrl,
  sourceVideoName,
  sourceVideoUrl,
  sourceVideoDurationText,
  labels,
  onToggleShowAll,
}: ResultPreviewPanelProps) {
  const sourceVideoResult = (
    <ResultSourceVideo
      sourceVideoName={sourceVideoName}
      sourceVideoUrl={sourceVideoUrl}
      sourceVideoDurationText={sourceVideoDurationText}
      labels={labels}
      showTitle={showAllResults}
    />
  );

  const currentResult =
    currentStep === 1 ? (
      <ResultScript script={script} labels={labels} showTitle={false} />
    ) : currentStep === 2 ? (
      <ResultAudio
        audioUrl={audioUrl}
        audioDurationText={audioDurationText}
        timedCaptions={timedCaptions}
        labels={labels}
        showTitle={false}
      />
    ) : currentStep === 3 ? (
      finalVideoUrl ? (
        <ResultFinalVideo
          finalVideoUrl={finalVideoUrl}
          labels={labels}
          showTitle={false}
        />
      ) : (
        <ResultBackground
          selectedBackgroundUrl={selectedBackgroundUrl}
          backgroundDurationText={backgroundDurationText}
          labels={labels}
          showTitle={false}
        />
      )
    ) : (
      <ResultFinalVideo
        finalVideoUrl={finalVideoUrl}
        labels={labels}
        showTitle={false}
      />
    );

  return (
    <Surface>
      <div className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{previewTitle}</h2>
          </div>

          <button
            type="button"
            aria-label={labels.toggleAria}
            onClick={onToggleShowAll}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
          >
            {showAllResults ? labels.currentOnly : labels.all}
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {showAllResults ? (
            <>
              {sourceVideoResult}
              <ResultScript script={script} labels={labels} showTitle />
              <ResultAudio
                audioUrl={audioUrl}
                audioDurationText={audioDurationText}
                timedCaptions={timedCaptions}
                labels={labels}
                showTitle
              />
              <ResultBackground
                selectedBackgroundUrl={selectedBackgroundUrl}
                backgroundDurationText={backgroundDurationText}
                labels={labels}
                showTitle
              />
              <ResultFinalVideo
                finalVideoUrl={finalVideoUrl}
                labels={labels}
                showTitle
              />
            </>
          ) : (
            <>
              {sourceVideoResult}
              {currentResult}
            </>
          )}
        </div>
      </div>
    </Surface>
  );
}
