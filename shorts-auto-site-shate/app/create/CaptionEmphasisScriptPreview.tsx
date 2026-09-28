import type { CaptionEffect } from "@/lib/captions/effects";
import type { CaptionEmphasisPoint } from "@/lib/captions/emphasis";

type Props = {
  script: string;
  points: CaptionEmphasisPoint[];
  labels: {
    previewTitle: string;
    highlightCount: (count: number) => string;
    noScript: string;
  };
};

type HighlightMatch = {
  start: number;
  end: number;
  point: CaptionEmphasisPoint;
};

const INLINE_EFFECT_CLASS: Record<CaptionEffect, string> = {
  highlight:
    "bg-yellow-300/25 text-yellow-100 ring-yellow-300/30 shadow-[0_0_18px_rgba(250,204,21,0.16)]",
  impact:
    "bg-red-400/20 text-red-100 ring-red-300/30 shadow-[0_0_18px_rgba(248,113,113,0.14)]",
  burst:
    "bg-orange-400/25 text-orange-50 ring-orange-300/40 shadow-[0_0_22px_rgba(251,146,60,0.25)]",
  pop:
    "bg-cyan-300/20 text-cyan-100 ring-cyan-300/30 shadow-[0_0_18px_rgba(103,232,249,0.14)]",
  clean: "bg-white/12 text-white ring-white/15",
};

function getHighlightMatches(script: string, points: CaptionEmphasisPoint[]) {
  const candidates = points
    .filter((point) => point.enabled && point.text.trim())
    .map((point) => {
      const text = point.text.trim();
      const start = script.indexOf(text);

      if (start < 0) return null;

      return {
        start,
        end: start + text.length,
        point,
      };
    })
    .filter((match): match is HighlightMatch => Boolean(match))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const matches: HighlightMatch[] = [];
  let cursor = 0;

  for (const candidate of candidates) {
    if (candidate.start < cursor) continue;
    matches.push(candidate);
    cursor = candidate.end;
  }

  return matches;
}

export default function CaptionEmphasisScriptPreview({
  script,
  points,
  labels,
}: Props) {
  const trimmedScript = script.trim();
  const matches = getHighlightMatches(script, points);
  const parts: Array<{ text: string; point?: CaptionEmphasisPoint }> = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ text: script.slice(cursor, match.start) });
    }

    parts.push({
      text: script.slice(match.start, match.end),
      point: match.point,
    });
    cursor = match.end;
  }

  if (cursor < script.length) {
    parts.push({ text: script.slice(cursor) });
  }

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
          {labels.previewTitle}
        </p>
        <p className="text-xs text-neutral-500">
          {labels.highlightCount(matches.length)}
        </p>
      </div>

      <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/25 p-3 text-xs leading-6 text-neutral-300">
        {trimmedScript ? (
          parts.map((part, index) =>
            part.point ? (
              <mark
                key={`${part.point.id}-${index}`}
                className={`mx-0.5 rounded-lg px-1.5 py-0.5 font-semibold text-inherit ring-1 ${INLINE_EFFECT_CLASS[part.point.effect]}`}
                title={part.point.reason}
              >
                {part.text}
              </mark>
            ) : (
              <span key={`script-${index}`}>{part.text}</span>
            )
          )
        ) : (
          <span className="text-neutral-600">{labels.noScript}</span>
        )}
      </div>
    </div>
  );
}
