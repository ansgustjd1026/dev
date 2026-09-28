import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import {
  CAPTION_EFFECT_OPTIONS,
  getCaptionEffectOption,
  type CaptionEffect,
} from "@/lib/captions/effects";
import type { CaptionEmphasisPoint } from "@/lib/captions/emphasis";

type Props = {
  points: CaptionEmphasisPoint[];
  isAnalyzing: boolean;
  canAnalyze: boolean;
  labels: {
    title: string;
    itemLabel: (index: number) => string;
    effectLabel: string;
    analyze: string;
    analyzing: string;
    add: string;
    empty: string;
    placeholder: string;
    remove: string;
    effectNames: Record<CaptionEffect, string>;
  };
  onAnalyze: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onTextChange: (id: string, value: string) => void;
  onEffectChange: (id: string, effect: CaptionEffect) => void;
};

export default function CaptionEmphasisEditor({
  points,
  isAnalyzing,
  canAnalyze,
  labels,
  onAnalyze,
  onAdd,
  onRemove,
  onToggle,
  onTextChange,
  onEffectChange,
}: Props) {
  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{labels.title}</h3>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canAnalyze || isAnalyzing}
            onClick={onAnalyze}
            className="px-3 py-2"
          >
            {isAnalyzing ? labels.analyzing : labels.analyze}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onAdd}
            className="px-3 py-2"
          >
            {labels.add}
          </Button>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-neutral-500">
          {labels.empty}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {points.map((point, index) => {
            const effectOption = getCaptionEffectOption(point.effect);

            return (
              <div
                key={point.id}
                className={`rounded-2xl border p-2.5 transition ${
                  point.enabled
                    ? effectOption.previewClassName
                    : "border-white/10 bg-white/[0.03] text-neutral-500"
                }`}
              >
                <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_160px_auto] lg:items-start">
                  <button
                    type="button"
                    onClick={() => onToggle(point.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      point.enabled
                        ? "border-white/20 bg-white/15 text-white"
                        : "border-white/10 bg-black/20 text-neutral-500"
                    }`}
                  >
                    {point.enabled ? "ON" : "OFF"}
                  </button>

                  <div className="min-w-0 flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-[0.18em] opacity-60">
                      {labels.itemLabel(index + 1)}
                    </label>
                    <Input
                      value={point.text}
                      onChange={(event) =>
                        onTextChange(point.id, event.target.value)
                      }
                      placeholder={labels.placeholder}
                      className="mt-1.5"
                    />
                  </div>

                  <label className="block min-w-40 text-xs font-semibold uppercase tracking-[0.18em] opacity-60">
                    {labels.effectLabel}
                    <select
                      value={point.effect}
                      onChange={(event) =>
                        onEffectChange(
                          point.id,
                          event.target.value as CaptionEffect
                        )
                      }
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-200/10"
                    >
                      {CAPTION_EFFECT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {labels.effectNames[option.id]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onRemove(point.id)}
                    className="px-3 py-2"
                  >
                    {labels.remove}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
