import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { recordOperationFailure } from "@/lib/operations/failures";
import { recordApiUsage } from "@/lib/api-usage/record";
import {
  ensureCreditsAvailable,
  getCreditErrorResponse,
  recordCreditUsage,
} from "@/lib/credits/usage";
import { compressTimedCaptions } from "@/lib/captions/ass";
import {
  isNumericSeparator,
  normalizeSpokenText,
} from "@/lib/captions/spoken-text";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";
import { downloadStorageFile } from "@/lib/security/storage-download";
import { createReadStream } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TimedCaption = {
  text: string;
  start: number;
  end: number;
};

type WhisperWord = {
  word?: string;
  start?: number;
  end?: number;
};

type ScriptLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";

const WHISPER_LANGUAGE_CODES: Record<ScriptLanguage, string> = {
  ko: "ko",
  en: "en",
  ja: "ja",
  zh: "zh",
  es: "es",
  fr: "fr",
};

function getSafeLanguage(language: unknown): ScriptLanguage {
  if (
    language === "ko" ||
    language === "en" ||
    language === "ja" ||
    language === "zh" ||
    language === "es" ||
    language === "fr"
  ) {
    return language;
  }

  return "ko";
}

function toSafeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cleanText(value: unknown) {
  return normalizeSpokenText(toSafeString(value));
}

function isOnlyPunctuation(text: string) {
  return /^[.,!?。！？…，、؛;:：,"“”'‘’「」『』()\\[\]{}]+$/.test(text.trim());
}

function cleanCaptionText(value: unknown) {
  return cleanText(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[「」『』]/g, "")
    .replace(/^[,，、\s]+|[,，、\s]+$/g, "")
    .replace(/\s+([.,!?。！？…，、;:：])/g, "$1")
    .trim();
}

function splitScriptToSentences(script: string) {
  const normalized = cleanText(script);

  if (!normalized) return [];

  const rawSentences: string[] = [];
  const closingMarks = new Set([
    '"',
    "'",
    "”",
    "’",
    "」",
    "』",
    ")",
    "]",
    "}",
  ]);
  let current = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    current += char;

    if (!/[.!?。！？]/.test(char)) continue;
    if (isNumericSeparator(normalized, index, char)) continue;

    while (
      index + 1 < normalized.length &&
      closingMarks.has(normalized[index + 1])
    ) {
      index += 1;
      current += normalized[index];
    }

    const sentence = cleanText(current);
    if (sentence) rawSentences.push(sentence);
    current = "";
  }

  const rest = cleanText(current);
  if (rest) rawSentences.push(rest);

  return rawSentences.filter((sentence) => !isOnlyPunctuation(sentence));
}

function mergeDanglingPunctuation(captions: string[]) {
  const merged: string[] = [];

  for (const rawCaption of captions) {
    let caption = cleanText(rawCaption);
    if (!caption) continue;

    const leadingClosingMarks = caption.match(/^[」』”’"'.,!?。！？…，、)\]}]+/);

    if (leadingClosingMarks && merged.length > 0) {
      merged[merged.length - 1] = cleanText(
        `${merged[merged.length - 1]}${leadingClosingMarks[0]}`
      );
      caption = cleanText(caption.slice(leadingClosingMarks[0].length));
    }

    if (!caption) continue;

    if (isOnlyPunctuation(caption) && merged.length > 0) {
      merged[merged.length - 1] = cleanText(
        `${merged[merged.length - 1]}${caption}`
      );
      continue;
    }

    merged.push(caption);
  }

  return merged;
}

function hasUnclosedQuote(text: string) {
  let hasOpenSingleQuote = false;
  let hasOpenDoubleQuote = false;
  const quotePairs: Array<[string, string]> = [
    ["“", "”"],
    ["‘", "’"],
    ["「", "」"],
    ["『", "』"],
  ];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1] ?? "";
    const next = text[index + 1] ?? "";

    if (
      char === "'" &&
      /[\p{L}\p{N}]/u.test(previous) &&
      /[\p{L}\p{N}]/u.test(next)
    ) {
      continue;
    }

    if (char !== "'" && char !== '"') continue;

    const isAtEnd = !next || /^[\s.,!?。！？…，、;:：)\]}]$/u.test(next);
    const isClosingWithoutLocalOpener =
      isAtEnd &&
      (char === "'" ? !hasOpenSingleQuote : !hasOpenDoubleQuote);

    // Generated narration sometimes preserves only a closing quote at the end
    // of a spoken line. It must not absorb every following caption as though a
    // new quotation had started.
    if (isClosingWithoutLocalOpener) continue;

    if (char === "'") hasOpenSingleQuote = !hasOpenSingleQuote;
    if (char === '"') hasOpenDoubleQuote = !hasOpenDoubleQuote;
  }

  if (hasOpenSingleQuote || hasOpenDoubleQuote) return true;

  return quotePairs.some(([open, close]) => {
    const openCount = [...text].filter((char) => char === open).length;
    const closeCount = [...text].filter((char) => char === close).length;

    return openCount > closeCount;
  });
}

function rebalanceQuotedCaptionFragments(captions: string[]) {
  const balanced: string[] = [];

  for (let index = 0; index < captions.length; index += 1) {
    const caption = cleanText(captions[index]);
    if (!caption) continue;

    const danglingOpeningQuote = caption.match(/^(.+?)\s+(["'“‘「『])$/u);

    if (danglingOpeningQuote && index + 1 < captions.length) {
      balanced.push(cleanText(danglingOpeningQuote[1]));
      captions[index + 1] = cleanText(
        `${danglingOpeningQuote[2]}${captions[index + 1]}`
      );
      continue;
    }

    const previousIndex = balanced.length - 1;

    if (previousIndex >= 0 && hasUnclosedQuote(balanced[previousIndex])) {
      balanced[previousIndex] = cleanText(`${balanced[previousIndex]} ${caption}`);
      continue;
    }

    balanced.push(caption);
  }

  return balanced;
}

function splitLongCaption(text: string, language: ScriptLanguage) {
  const safeText = cleanText(text);

  if (!safeText) return [];

  const usesSpaces = language === "en" || language === "es" || language === "fr";
  const maxChars = usesSpaces ? 38 : language === "ko" ? 32 : 16;
  const minChars = usesSpaces ? 18 : language === "ko" ? 12 : 7;

  if (safeText.length <= maxChars) {
    return [safeText];
  }

  const words = safeText.split(" ");
  const result: string[] = [];
  let startIndex = 0;

  const isPreferredBreak = (word: string) => {
    if (/[,:;，、；：]$/u.test(word)) return true;
    if (language !== "ko") return false;

    return /(고|며|면서|지만|는데|더니|라며|해서|하자|니까|라서|뒤|후)$/u.test(
      word.replace(/[,:;，、；：]$/u, "")
    );
  };

  while (startIndex < words.length) {
    let endIndex = startIndex;
    let candidate = words[startIndex];

    while (
      endIndex + 1 < words.length &&
      `${candidate} ${words[endIndex + 1]}`.length <= maxChars
    ) {
      endIndex += 1;
      candidate = `${candidate} ${words[endIndex]}`;
    }

    if (endIndex === words.length - 1) {
      result.push(candidate);
      break;
    }

    let preferredEnd = -1;
    for (let index = endIndex; index >= startIndex; index -= 1) {
      const part = words.slice(startIndex, index + 1).join(" ");
      if (part.length < minChars) break;
      if (isPreferredBreak(words[index])) {
        preferredEnd = index;
        break;
      }
    }

    const finalEnd = preferredEnd >= startIndex ? preferredEnd : endIndex;
    result.push(words.slice(startIndex, finalEnd + 1).join(" "));
    startIndex = finalEnd + 1;
  }

  const finalResult: string[] = [];

  for (const part of result) {
    if (part.length <= maxChars) {
      finalResult.push(part);
      continue;
    }

    let currentPart = "";

    for (const char of part) {
      currentPart += char;

      if (currentPart.length >= maxChars) {
        finalResult.push(currentPart.trim());
        currentPart = "";
      }
    }

    if (currentPart.trim()) {
      finalResult.push(currentPart.trim());
    }
  }

  return finalResult.filter((part) => part && !isOnlyPunctuation(part));
}

function endsWithSentenceBoundary(text: string) {
  return /[.!?。！？]["'”’」』\])}]*$/u.test(text.trim());
}

function splitSentenceForSpeech(text: string, language: ScriptLanguage) {
  const safeText = cleanText(text);
  if (!safeText) return [];

  const minCharacters =
    language === "ko" ? 10 : language === "ja" || language === "zh" ? 7 : 18;
  const pauseMarks = new Set([",", ";", ":", "、", "，", "；", "："]);
  const openingQuotes = new Set(["“", "‘", "「", "『"]);
  const closingQuotes = new Set(["”", "’", "」", "』"]);
  const parts: string[] = [];
  let current = "";
  let quoteDepth = 0;

  for (let index = 0; index < safeText.length; index += 1) {
    const char = safeText[index];
    const previous = safeText[index - 1] ?? "";
    const next = safeText[index + 1] ?? "";
    current += char;

    if (openingQuotes.has(char)) {
      quoteDepth += 1;
      continue;
    }

    if (
      (char === "\"" || char === "'") &&
      !(char === "'" && /[\p{L}\p{N}]/u.test(previous) && /[\p{L}\p{N}]/u.test(next))
    ) {
      quoteDepth = quoteDepth > 0 ? quoteDepth - 1 : 1;
      continue;
    }

    if (closingQuotes.has(char)) {
      quoteDepth = Math.max(0, quoteDepth - 1);
      continue;
    }

    if (
      quoteDepth === 0 &&
      pauseMarks.has(char) &&
      !isNumericSeparator(safeText, index, char) &&
      current.replace(/\s/g, "").length >= minCharacters
    ) {
      parts.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) parts.push(current.trim());

  return parts.flatMap((part) => splitLongCaption(part, language));
}

export function makeCaptionTextsFromScript(
  script: string,
  language: ScriptLanguage
) {
  const sentences = splitScriptToSentences(script);
  const captions: string[] = [];

  for (const sentence of sentences) {
    captions.push(...splitSentenceForSpeech(sentence, language));
  }

  return rebalanceQuotedCaptionFragments(
    mergeDanglingPunctuation(
      captions
        .map((caption) => cleanCaptionText(caption))
        .filter((caption) => caption.length > 0)
    )
  );
}

function isProgressiveCaption(previous: string, next: string) {
  const compactPrevious = previous.replace(/\s+/g, " ").trim().toLowerCase();
  const compactNext = next.replace(/\s+/g, " ").trim().toLowerCase();

  if (compactPrevious.length < 4) return false;
  if (compactNext.length <= compactPrevious.length) return false;

  return compactNext.startsWith(`${compactPrevious} `);
}

function removeProgressiveCaptionFragments(captions: string[]) {
  return captions.filter((caption, index) => {
    const nextCaption = captions[index + 1];

    if (!nextCaption) return true;

    return !isProgressiveCaption(caption, nextCaption);
  });
}

function getMinimumCaptionCharacters(language: ScriptLanguage) {
  if (language === "ko") return 9;
  if (language === "ja" || language === "zh") return 6;
  return 18;
}

function mergeShortCaptionFragments(
  captions: string[],
  language: ScriptLanguage
) {
  const minCharacters = getMinimumCaptionCharacters(language);
  const merged: string[] = [];

  for (const caption of captions) {
    const previous = merged[merged.length - 1];

    if (!previous) {
      merged.push(caption);
      continue;
    }

    const compactLength = caption.replace(/\s/g, "").length;

    if (
      !endsWithSentenceBoundary(previous) &&
      (compactLength < minCharacters || isProgressiveCaption(previous, caption))
    ) {
      merged[merged.length - 1] = cleanText(`${previous} ${caption}`);
      continue;
    }

    merged.push(caption);
  }

  return merged;
}

function mergeFastCaptionFragments(
  captions: string[],
  audioDuration: number,
  language: ScriptLanguage
) {
  const minDuration = language === "ko" || language === "ja" || language === "zh"
    ? 0.65
    : 0.85;
  const merged = [...captions];

  while (merged.length > 1) {
    const charCounts = merged.map((text) =>
      Math.max(1, cleanText(text).replace(/\s/g, "").length)
    );
    const totalChars = charCounts.reduce((sum, count) => sum + count, 0);
    const shortIndex = charCounts.findIndex(
      (count) => (audioDuration * count) / totalChars < minDuration
    );

    if (shortIndex < 0) break;

    if (shortIndex === merged.length - 1) {
      const previousIndex = shortIndex - 1;

      if (endsWithSentenceBoundary(merged[previousIndex])) break;

      merged[previousIndex] = cleanText(
        `${merged[previousIndex]} ${merged[shortIndex]}`
      );
      merged.splice(shortIndex, 1);
      continue;
    }

    if (endsWithSentenceBoundary(merged[shortIndex])) break;

    merged[shortIndex] = cleanText(
      `${merged[shortIndex]} ${merged[shortIndex + 1]}`
    );
    merged.splice(shortIndex + 1, 1);
  }

  return merged;
}

function getAudioInfoFromWords(words: WhisperWord[]) {
  const validWords = words.filter(
    (word) => typeof word.start === "number" && typeof word.end === "number"
  );

  if (validWords.length === 0) {
    return null;
  }

  const firstStart = validWords[0].start ?? 0;
  const lastEnd = validWords[validWords.length - 1].end ?? 0;

  return {
    start: Math.max(0, firstStart),
    end: Math.max(0, lastEnd),
    duration: Math.max(0, lastEnd - firstStart),
  };
}

function getValidWords(words: WhisperWord[]) {
  return words
    .map((word) => ({
      text: cleanText(word.word),
      start: typeof word.start === "number" ? Math.max(0, word.start) : null,
      end: typeof word.end === "number" ? Math.max(0, word.end) : null,
    }))
    .filter(
      (
        word
      ): word is {
        text: string;
        start: number;
        end: number;
      } => Boolean(word.text) && word.start !== null && word.end !== null && word.end > word.start
    );
}

function getCaptionWeight(text: string) {
  return Math.max(1, cleanText(text).replace(/\s/g, "").length);
}

function findWordIndexForWeight(
  cumulativeWordWeights: number[],
  targetWeight: number,
  minimumIndex: number
) {
  const safeMinimumIndex = Math.min(
    Math.max(0, minimumIndex),
    cumulativeWordWeights.length - 1
  );

  for (let index = safeMinimumIndex; index < cumulativeWordWeights.length; index += 1) {
    if (cumulativeWordWeights[index] >= targetWeight) {
      return index;
    }
  }

  return cumulativeWordWeights.length - 1;
}

function makeTimedCaptionsFromWords(
  captionTexts: string[],
  words: WhisperWord[]
) {
  const validWords = getValidWords(words);

  if (validWords.length < 2) return null;

  const wordWeights = validWords.map((word) => getCaptionWeight(word.text));
  const cumulativeWordWeights: number[] = [];
  let totalWordWeight = 0;

  for (const weight of wordWeights) {
    totalWordWeight += weight;
    cumulativeWordWeights.push(totalWordWeight);
  }

  const captionWeights = captionTexts.map(getCaptionWeight);
  const totalCaptionWeight = captionWeights.reduce(
    (sum, weight) => sum + weight,
    0
  );

  if (totalCaptionWeight <= 0 || totalWordWeight <= 0) return null;

  let cumulativeCaptionWeight = 0;
  let previousWordIndex = -1;
  let previousEnd = 0;

  return captionTexts.map((text, index) => {
    const startWeight =
      (cumulativeCaptionWeight / totalCaptionWeight) * totalWordWeight;

    cumulativeCaptionWeight += captionWeights[index];

    const endWeight =
      (cumulativeCaptionWeight / totalCaptionWeight) * totalWordWeight;

    const minimumStartIndex = Math.min(
      previousWordIndex + 1,
      validWords.length - 1
    );
    const startIndex = findWordIndexForWeight(
      cumulativeWordWeights,
      startWeight,
      minimumStartIndex
    );
    const endIndex =
      index === captionTexts.length - 1
        ? validWords.length - 1
        : findWordIndexForWeight(cumulativeWordWeights, endWeight, startIndex);

    previousWordIndex = Math.max(previousWordIndex, endIndex);

    const start = Math.max(validWords[startIndex].start, previousEnd);
    let end = validWords[endIndex].end;

    if (end <= start) {
      end = start + 0.45;
    }

    previousEnd = end;

    return {
      text: cleanText(text),
      start,
      end,
    };
  });
}

function makeTimedCaptionsFromScript(
  script: string,
  language: ScriptLanguage,
  words: WhisperWord[],
  fallbackText: string
) {
  let captionTexts = makeCaptionTextsFromScript(script, language);

  if (captionTexts.length === 0) {
    captionTexts = makeCaptionTextsFromScript(fallbackText, language);
  }

  if (captionTexts.length === 0) {
    throw new Error("원본 대본에서 자막 문장을 만들 수 없습니다.");
  }

  captionTexts = mergeShortCaptionFragments(
    removeProgressiveCaptionFragments(captionTexts),
    language
  );

  const audioInfo = getAudioInfoFromWords(words);

  const audioStart = audioInfo?.start ?? 0;
  const audioEnd =
    audioInfo && audioInfo.duration > 0
      ? audioInfo.end
      : Math.max(1, captionTexts.length * 2.2);

  const audioDuration = Math.max(1, audioEnd - audioStart);

  captionTexts = mergeFastCaptionFragments(
    captionTexts,
    audioDuration,
    language
  );

  const wordTimedCaptions = makeTimedCaptionsFromWords(captionTexts, words);

  if (wordTimedCaptions) {
    return wordTimedCaptions.filter((caption) => {
      if (!caption.text.trim()) return false;
      if (isOnlyPunctuation(caption.text)) return false;
      if (caption.end <= caption.start) return false;
      return true;
    });
  }

  const charCounts = captionTexts.map((text) =>
    Math.max(1, cleanText(text).replace(/\s/g, "").length)
  );

  const totalChars = charCounts.reduce((sum, count) => sum + count, 0);

  let cumulativeChars = 0;

  const timedCaptions: TimedCaption[] = captionTexts.map((text, index) => {
    const startRatio = cumulativeChars / totalChars;

    cumulativeChars += charCounts[index];

    const endRatio = cumulativeChars / totalChars;

    const start = audioStart + audioDuration * startRatio;
    let end = audioStart + audioDuration * endRatio;

    if (index === captionTexts.length - 1) {
      end = audioEnd;
    }

    if (end <= start) {
      end = start + 0.7;
    }

    return {
      text: cleanText(text),
      start,
      end,
    };
  });

  return timedCaptions.filter((caption) => {
    if (!caption.text.trim()) return false;
    if (isOnlyPunctuation(caption.text)) return false;
    if (caption.end <= caption.start) return false;
    return true;
  });
}

export async function POST(req: Request) {
  let userId: string | null = null;
  let tempDir = "";

  try {
    const user = await getAuthenticatedApiUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    userId = user.id;

    const rateLimitResponse = enforceRateLimit({
      key: `transcribe-audio:${user.id}`,
      limit: 5,
      windowMs: 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(req, 32 * 1024)) as {
      audioUrl?: unknown;
      script?: unknown;
      language?: unknown;
    };
    const { audioUrl, script, language } = body;

    if (!isStringWithinLimit(audioUrl, 2_048)) {
      return NextResponse.json(
        { error: "분석할 음성 파일 URL이 없습니다." },
        { status: 400 }
      );
    }

    if (!isStringWithinLimit(script, 10_000)) {
      return NextResponse.json(
        { error: "자막 대본은 1자 이상 10,000자 이하여야 합니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const safeLanguage = getSafeLanguage(language);

    await ensureCreditsAvailable({
      userId: user.id,
      action: "transcribe_audio",
    });

    await recordCreditUsage({
      userId: user.id,
      action: "transcribe_audio",
      metadata: {
        scriptLength: typeof script === "string" ? script.length : 0,
        language: safeLanguage,
        chargedAtRequest: true,
      },
    });

    tempDir = path.join(os.tmpdir(), `shorts-transcribe-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const audioPath = path.join(tempDir, "audio.mp3");

    await downloadStorageFile({
      url: audioUrl as string,
      outputPath: audioPath,
      bucket: "tts-audio",
      userId: user.id,
      maxBytes: 20 * 1024 * 1024,
    });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: "whisper-1",
      language: WHISPER_LANGUAGE_CODES[safeLanguage],
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    await recordApiUsage({
      userId: user.id,
      operation: "audio_transcribe",
      model: "whisper-1",
      metrics: {
        audioSeconds: transcription.usage?.seconds ?? transcription.duration,
      },
      metadata: { language: safeLanguage },
    });

    const words = Array.isArray(transcription.words)
      ? transcription.words
      : [];

    const transcriptionText =
      typeof transcription.text === "string" ? transcription.text : "";

    const timedCaptions = compressTimedCaptions(makeTimedCaptionsFromScript(
      script as string,
      safeLanguage,
      words,
      transcriptionText
    ));

    if (timedCaptions.length === 0) {
      return NextResponse.json(
        { error: "자막 타임스탬프를 만들 수 없습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timedCaptions,
      text: transcriptionText,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const creditResponse = getCreditErrorResponse(error);
    if (creditResponse) return creditResponse;

    await recordOperationFailure({
      userId,
      stage: "audio_transcribe",
      error,
    });

    let message = "음성 자막 싱크 분석 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
