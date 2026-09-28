type Props = {
  sourceVideoName: string;
  sourceVideoDurationText: string;
  labels: {
    fallbackName: string;
    preparing: string;
  };
};

export default function SourceVideoReferenceCard({
  sourceVideoName,
  sourceVideoDurationText,
  labels,
}: Props) {
  return (
    <div className="mb-6 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-cyan-50">
            {sourceVideoName || labels.fallbackName}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {sourceVideoDurationText && (
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-cyan-100">
              {sourceVideoDurationText}
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-neutral-300">
            {labels.preparing}
          </span>
        </div>
      </div>
    </div>
  );
}
