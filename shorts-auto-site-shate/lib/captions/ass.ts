import "server-only";

import {
  type CaptionEffect,
} from "@/lib/captions/effects";
import {
  normalizeCaptionEmphasisPoints,
  type CaptionEmphasisPoint,
} from "@/lib/captions/emphasis";

export type TimedCaption = {
  text: string;
  start: number;
  end: number;
};

const DEFAULT_MAX_RENDER_CAPTIONS = 500;
const DEFAULT_MAX_CAPTION_TEXT_LENGTH = 200;

function joinCaptionText(current: string, next: string) {
  if (!current) return next;

  // CJK captions do not need a synthetic space; Latin-based captions remain readable.
  return /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(current)
    ? `${current}${next}`
    : `${current} ${next}`;
}

/**
 * Keeps long narrations renderable without discarding subtitle timing. The source
 * script is capped at 10,000 characters, so grouping adjacent short captions is
 * sufficient to stay within the renderer's 500-event ASS limit.
 */
export function compressTimedCaptions(
  timedCaptions: TimedCaption[],
  maxCount = DEFAULT_MAX_RENDER_CAPTIONS,
  maxTextLength = DEFAULT_MAX_CAPTION_TEXT_LENGTH
) {
  const captions = timedCaptions
    .filter(
      (caption) =>
        caption &&
        typeof caption.text === "string" &&
        Number.isFinite(caption.start) &&
        Number.isFinite(caption.end)
    )
    .map((caption) => ({
      text: caption.text.trim(),
      start: Math.max(0, caption.start),
      end: Math.max(caption.start + 0.25, caption.end),
    }))
    .filter((caption) => caption.text.length > 0);

  if (
    captions.length <= maxCount &&
    captions.every((caption) => caption.text.length <= maxTextLength)
  ) {
    return captions;
  }

  const compressed: TimedCaption[] = [];
  let cursor = 0;

  while (cursor < captions.length && compressed.length < maxCount) {
    const remainingCaptions = captions.length - cursor;
    const remainingSlots = maxCount - compressed.length;
    const minimumItems = Math.max(1, Math.ceil(remainingCaptions / remainingSlots));
    const first = captions[cursor];
    const parts = [first.text.slice(0, maxTextLength)];
    let end = first.end;
    cursor += 1;

    while (cursor < captions.length) {
      const candidate = captions[cursor];
      const combined = parts.reduce(
        (value, part) => joinCaptionText(value, part),
        ""
      );
      const withCandidate = joinCaptionText(combined, candidate.text);
      const mustMerge = parts.length < minimumItems;

      if (withCandidate.length > maxTextLength) {
        // A single unusually long caption was already trimmed above. Preserve
        // the next caption for its own timed event rather than dropping it.
        if (mustMerge) break;
        break;
      }

      parts.push(candidate.text);
      end = candidate.end;
      cursor += 1;

      if (!mustMerge) break;
    }

    compressed.push({
      text: parts.reduce((value, part) => joinCaptionText(value, part), ""),
      start: first.start,
      end: Math.max(first.start + 0.25, end),
    });
  }

  return compressed;
}

function formatAssTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);

  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  const cs = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100);

  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0"
  )}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string) {
  return text
    .replace(/[{}]/g, "")
    .replace(/\\/g, "＼")
    .replace(/,/g, "，")
    .replace(/\n/g, "\\N");
}

function isValidCaption(caption: unknown): caption is TimedCaption {
  if (!caption || typeof caption !== "object") return false;

  const item = caption as TimedCaption;

  return (
    typeof item.text === "string" &&
    typeof item.start === "number" &&
    typeof item.end === "number" &&
    item.text.trim().length > 0 &&
    item.end > item.start
  );
}

export function normalizeCaptions(captions: TimedCaption[]) {
  const normalized = captions
    .filter(isValidCaption)
    .map((caption) => {
      const start = Math.max(0, caption.start);
      const end = Math.max(start + 0.25, caption.end);

      return {
        text: caption.text.trim(),
        start,
        end,
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: TimedCaption[] = [];

  for (const caption of normalized) {
    let text = caption.text;
    const leadingClosingMarks = text.match(/^[”’"'.,!?。！？…，、)\]}]+/);

    if (leadingClosingMarks && merged.length > 0) {
      const previous = merged[merged.length - 1];
      previous.text = `${previous.text}${leadingClosingMarks[0]}`;
      previous.end = Math.max(previous.end, caption.end);
      text = text.slice(leadingClosingMarks[0].length).trim();
    }

    if (!text) continue;

    if (/^[.,!?。！？…,"“”'‘’，、]+$/.test(text) && merged.length > 0) {
      const previous = merged[merged.length - 1];
      previous.text = `${previous.text}${text}`;
      previous.end = Math.max(previous.end, caption.end);
      continue;
    }

    merged.push({
      ...caption,
      text,
    });
  }

  const adjusted: TimedCaption[] = [];

  for (const caption of merged) {
    const previous = adjusted[adjusted.length - 1];

    if (previous && previous.end > caption.start) {
      previous.end = Math.min(
        previous.end,
        Math.max(previous.start + 0.25, caption.start)
      );
    }

    const start = previous ? Math.max(caption.start, previous.end) : caption.start;
    const end = Math.max(start + 0.25, caption.end);

    adjusted.push({
      ...caption,
      start,
      end,
    });
  }

  return adjusted;
}

function getEffectTag(effect: CaptionEffect) {
  if (effect === "burst") {
    return "{\\c&H0035B8FF&\\3c&H00002078&\\bord12\\shad5\\fs96\\b1\\t(0,65,\\fscx136\\fscy136\\bord17\\blur2)\\t(65,180,\\fscx100\\fscy100\\bord9\\blur0)}";
  }

  if (effect === "impact") {
    return "{\\c&H004848FF&\\3c&H00000000&\\bord9\\shad3\\fs92\\b1\\t(0,90,\\fs102)\\t(90,260,\\fs88)}";
  }

  if (effect === "pop") {
    return "{\\c&H00FFE45C&\\3c&H00000000&\\bord8\\shad3\\fs90\\b1\\t(0,90,\\fs104)\\t(90,250,\\fs86)}";
  }

  if (effect === "clean") {
    return "{\\c&H00FFFFFF&\\3c&H00000000&\\bord6\\shad2\\fs82\\b1}";
  }

  return "{\\c&H0000E5FF&\\3c&H00000000&\\bord8\\shad3\\fs88\\b1\\t(0,120,\\fs94)\\t(120,260,\\fs86)}";
}

function getCaptionLeadTag(effect?: CaptionEffect) {
  if (effect === "burst") {
    return "{\\fad(15,90)\\t(0,65,\\fscx118\\fscy118)\\t(65,180,\\fscx100\\fscy100)}";
  }

  if (effect === "impact") {
    return "{\\fad(30,70)\\t(0,90,\\fscx108\\fscy108)\\t(90,240,\\fscx100\\fscy100)}";
  }

  if (effect === "pop" || effect === "highlight") {
    return "{\\fad(30,70)\\t(0,90,\\fscx106\\fscy106)\\t(90,240,\\fscx100\\fscy100)}";
  }

  return "{\\fad(40,90)}";
}

function getTimedCaptionLeadTag(start: number, effect?: CaptionEffect) {
  // libass renders the first video frame before a fade-in becomes visible.
  // Captions beginning at zero should be fully visible immediately.
  return start <= 0.05 ? "" : getCaptionLeadTag(effect);
}

function applyPointToText(text: string, point: CaptionEmphasisPoint) {
  const target = point.text.trim();
  if (!target) return null;

  const index = text.indexOf(target);
  const tag = getEffectTag(point.effect);

  if (index >= 0) {
    const before = text.slice(0, index);
    const match = text.slice(index, index + target.length);
    const after = text.slice(index + target.length);

    return `${escapeAssText(before)}${tag}${escapeAssText(
      match
    )}{\\rDefault}${escapeAssText(after)}`;
  }

  if (target.includes(text) && text.length >= 2) {
    return `${tag}${escapeAssText(text)}{\\rDefault}`;
  }

  const compactText = text.replace(/\s+/g, "");
  const compactTarget = target.replace(/\s+/g, "");

  if (
    compactTarget.length >= 2 &&
    (compactText.includes(compactTarget) || compactTarget.includes(compactText))
  ) {
    return `${tag}${escapeAssText(text)}{\\rDefault}`;
  }

  return null;
}

function applyEmphasisToCaption(
  text: string,
  emphasisPoints: CaptionEmphasisPoint[],
  start: number
) {
  const enabledPoints = emphasisPoints
    .filter((point) => point.enabled && point.text.trim())
    .sort((a, b) => b.text.length - a.text.length);

  for (const point of enabledPoints) {
    const styledText = applyPointToText(text, point);
    if (styledText) return `${getTimedCaptionLeadTag(start, point.effect)}${styledText}`;
  }

  return `${getTimedCaptionLeadTag(start)}${escapeAssText(text)}`;
}

export function createSubtitleAssContent({
  timedCaptions,
  captionEmphasis = [],
}: {
  timedCaptions: TimedCaption[];
  captionEmphasis?: unknown;
}) {
  const captions = normalizeCaptions(timedCaptions);

  if (captions.length === 0) {
    throw new Error("사용 가능한 자막 타임스탬프가 없습니다.");
  }

  const emphasisPoints = normalizeCaptionEmphasisPoints(captionEmphasis);
  const captionFontName =
    process.env.CAPTION_FONT_NAME?.trim() ||
    (process.platform === "win32" ? "Malgun Gothic" : "Noto Sans CJK KR");

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${captionFontName},82,&H00FFFFFF,&H00FFFFFF,&H00000000,&H77000000,1,0,0,0,100,100,0,0,1,7,3,2,90,90,285,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = captions.map((caption) => {
    return `Dialogue: 0,${formatAssTime(caption.start)},${formatAssTime(
      caption.end
    )},Default,,0,0,0,,${applyEmphasisToCaption(
      caption.text,
      emphasisPoints,
      caption.start
    )}`;
  });

  return {
    assContent: `${header}\n${events.join("\n")}`,
    captionCount: captions.length,
    emphasizedCaptionCount: captions.filter((caption) =>
      emphasisPoints.some(
        (point) =>
          point.enabled &&
          point.text.trim() &&
          (caption.text.includes(point.text.trim()) ||
            point.text.trim().includes(caption.text) ||
            caption.text
              .replace(/\s+/g, "")
              .includes(point.text.trim().replace(/\s+/g, "")) ||
            point.text
              .trim()
              .replace(/\s+/g, "")
              .includes(caption.text.replace(/\s+/g, "")))
      )
    ).length,
  };
}
