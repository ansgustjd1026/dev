import { NextResponse } from "next/server";
import OpenAI from "openai";
import { APP_TEXT_MODEL } from "@/lib/openai/models";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { recordOperationFailure } from "@/lib/operations/failures";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordApiUsage,
  recordOpenAIResponseUsage,
} from "@/lib/api-usage/record";
import {
  ensureCreditsAvailable,
  getCreditErrorResponse,
  recordCreditUsage,
} from "@/lib/credits/usage";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";
import { downloadStorageFile } from "@/lib/security/storage-download";
import {
  getFfmpegMissingMessage,
  getFfmpegPath,
  isFfmpegMissingError,
} from "@/lib/media/ffmpeg";
import {
  compressTimedCaptions,
  createSubtitleAssContent,
  type TimedCaption,
} from "@/lib/captions/ass";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import {
  getSafeVideoVisualStyle,
  getVideoVisualStylePrompt,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const IMAGE_SCENE_MODEL = APP_TEXT_MODEL;
const IMAGE_GENERATION_MODEL = "gpt-image-2";
const IMAGE_GENERATION_QUALITY = "medium" as const;
const MAX_SCENE_IMAGES = 8;
const MIN_SCENE_GAP_SECONDS = 8;
const IMAGE_VIDEO_CREDITS = 50;
const AUTO_CREATE_IMAGE_VIDEO_CREDITS = 47;
const SCENE_ASSET_CONCURRENCY = 3;
const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FFMPEG_BASE_ARGS = ["-hide_banner", "-loglevel", "error", "-nostdin"];
const FFMPEG_MAX_BUFFER = 4 * 1024 * 1024;
const FFMPEG_THREADS = Math.min(
  4,
  Math.max(1, Number.parseInt(process.env.FFMPEG_THREADS ?? "1", 10) || 1)
);
function getRenderDimensions() {
  // The Render free instance has 512 MB RAM. A 540p portrait render keeps
  // ffmpeg, subtitle rendering, and temporary scene clips within that budget.
  // Paid or self-hosted workers can opt back into 720p through env variables.
  const isRenderFreeCandidate = Boolean(
    process.env.RENDER || process.env.RENDER_EXTERNAL_URL
  );
  const fallbackWidth = isRenderFreeCandidate ? 540 : 720;
  const width = Number.parseInt(
    process.env.VIDEO_RENDER_WIDTH ?? String(fallbackWidth),
    10
  );
  const height = Number.parseInt(
    process.env.VIDEO_RENDER_HEIGHT ?? String(Math.round((width * 16) / 9)),
    10
  );

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 360 ||
    height < 640 ||
    Math.abs(width / height - 9 / 16) > 0.01
  ) {
    return { width: fallbackWidth, height: Math.round((fallbackWidth * 16) / 9) };
  }

  return { width, height };
}

const RENDER_DIMENSIONS = getRenderDimensions();
const VIDEO_WIDTH = RENDER_DIMENSIONS.width;
const VIDEO_HEIGHT = RENDER_DIMENSIONS.height;
const MOTION_WIDTH = Math.round(VIDEO_WIDTH * 1.05);
const MOTION_HEIGHT = Math.round(VIDEO_HEIGHT * 1.05);
type ImageScene = {
  from: number;
  to: number;
  keyword: string;
  captionText: string;
  query: string;
};
type ResolvedImageScene = ImageScene;

type ScriptLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";

function getSafeScriptLanguage(value: unknown): ScriptLanguage {
  return value === "en" ||
    value === "ja" ||
    value === "zh" ||
    value === "es" ||
    value === "fr"
    ? value
    : "ko";
}

function getCulturalVisualDirection(language: ScriptLanguage) {
  const directions: Record<ScriptLanguage, string> = {
    ko: "When people appear, depict Korean people in a believable contemporary South Korean setting.",
    en: "When people appear and the narration gives no location, use a believable contemporary English-speaking setting with naturally diverse people.",
    ja: "When people appear, depict Japanese people in a believable contemporary Japanese setting.",
    zh: "When people appear, depict Chinese people in a believable contemporary Chinese-speaking setting.",
    es: "When people appear, depict people and surroundings natural to a contemporary Spanish-speaking community.",
    fr: "When people appear, depict people and surroundings natural to a contemporary French-speaking community.",
  };

  return (
    directions[language] +
    " If the narration explicitly names a different country, culture, ethnicity, or person, follow the narration instead. Avoid caricatures and stereotypes."
  );
}

function getSafeBackgroundPlaybackSpeed(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(0.5, value));
}

function normalizeSceneRanges(
  scenes: ImageScene[],
  captions: TimedCaption[]
) {
  const sortedScenes = [...scenes]
    .sort((left, right) => left.from - right.from)
    .filter(
      (scene, index, values) =>
        index === 0 || scene.from !== values[index - 1].from
    );

  return sortedScenes.map((scene, index) => {
    const nextScene = sortedScenes[index + 1];
    return {
      ...scene,
      // Each image begins at the exact caption where its keyword is spoken and
      // remains until the next important cue.
      from: scene.from,
      to: nextScene ? Math.max(scene.from, nextScene.from - 1) : captions.length - 1,
    };
  });
}

function createSceneFromCaption(caption: TimedCaption, index: number): ImageScene {
  const text = caption.text.trim() || "documentary editorial scene";
  return {
    from: index,
    to: index,
    keyword: text.slice(0, 60),
    captionText: text.slice(0, 200),
    query: text.slice(0, 100),
  };
}

function getTargetSceneCount(captions: TimedCaption[]) {
  if (captions.length === 0) return 0;

  const duration = Math.max(
    0,
    captions[captions.length - 1].end - captions[0].start
  );
  return Math.min(
    Math.max(1, Math.floor(duration / 15)),
    captions.length,
    MAX_SCENE_IMAGES
  );
}

export function ensureMinimumSceneCoverage(
  scenes: ImageScene[],
  captions: TimedCaption[]
) {
  const minimumCount = getTargetSceneCount(captions);
  if (minimumCount === 0) return [];

  const selected = new Map<number, ImageScene>();
  for (const scene of scenes) selected.set(scene.from, scene);

  const timelineStart = captions[0].start;
  const timelineDuration = Math.max(
    0.1,
    captions[captions.length - 1].end - timelineStart
  );

  for (let slot = 0; slot < minimumCount && selected.size < minimumCount; slot += 1) {
    const targetTime = timelineStart + (timelineDuration * slot) / minimumCount;
    let index = captions.findIndex((caption) => caption.start >= targetTime);
    if (index < 0) index = captions.length - 1;
    if (!selected.has(index)) {
      selected.set(index, createSceneFromCaption(captions[index], index));
    }
  }

  for (let index = 0; index < captions.length && selected.size < minimumCount; index += 1) {
    if (!selected.has(index)) {
      selected.set(index, createSceneFromCaption(captions[index], index));
    }
  }

  return normalizeSceneRanges([...selected.values()], captions).slice(
    0,
    getTargetSceneCount(captions)
  );
}

function createFallbackScenes(captions: TimedCaption[]) {
  return ensureMinimumSceneCoverage([], captions);
}

function normalizeCueText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function parseImageScenes(value: string, captions: TimedCaption[]) {
  try {
    const parsed = JSON.parse(value.trim().replace(/^```json\s*|\s*```$/g, "")) as {
      scenes?: unknown;
    };
    if (!Array.isArray(parsed.scenes)) return [];

    const parsedScenes = parsed.scenes
      .map((scene) => {
        if (!scene || typeof scene !== "object") return null;
        const candidate = scene as Record<string, unknown>;
        const from = typeof candidate.from === "number" ? Math.floor(candidate.from) : -1;
        const to =
          typeof candidate.to === "number"
            ? Math.floor(candidate.to)
            : from;
        const keyword =
          typeof candidate.keyword === "string"
            ? candidate.keyword.trim()
            : "";
        const captionText =
          typeof candidate.captionText === "string"
            ? candidate.captionText.trim()
            : "";
        const query = typeof candidate.query === "string" ? candidate.query.trim() : "";
        if (!keyword || !captionText || !query) {
          return null;
        }

        const normalizedCaptionText = normalizeCueText(captionText);
        const normalizedKeyword = normalizeCueText(keyword);
        const matchedCaptionIndex = captions.findIndex((caption) => {
          const normalizedCaption = normalizeCueText(caption.text);
          return (
            normalizedCaption === normalizedCaptionText ||
            (normalizedCaptionText.length >= 3 &&
              normalizedCaption.includes(normalizedCaptionText)) ||
            (normalizedKeyword.length >= 2 &&
              normalizedCaption.includes(normalizedKeyword))
          );
        });
        const matchedFrom =
          matchedCaptionIndex >= 0
            ? matchedCaptionIndex
            : from >= 0 && from < captions.length
              ? from
              : -1;

        if (matchedFrom < 0) return null;

        return {
          from: matchedFrom,
          to:
            to >= matchedFrom
              ? Math.min(to, captions.length - 1)
              : matchedFrom,
          keyword: keyword.slice(0, 60),
          captionText: captionText.slice(0, 200),
          query: query.slice(0, 100),
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          (left as ImageScene).from - (right as ImageScene).from
      ) as ImageScene[];
    const sparseScenes: ImageScene[] = [];

    for (const scene of parsedScenes) {
      const previous = sparseScenes.at(-1);
      if (
        previous &&
        captions[scene.from].start - captions[previous.from].start <
          MIN_SCENE_GAP_SECONDS
      ) {
        continue;
      }
      sparseScenes.push(scene);
    }

    return sparseScenes.slice(0, getTargetSceneCount(captions));
  } catch {
    return [];
  }
}

async function planImageScenes(
  script: string,
  captions: TimedCaption[],
  userId: string,
  language: ScriptLanguage,
  visualStyle: VideoVisualStyle
) {
  const fallback = createFallbackScenes(captions);
  if (!process.env.OPENAI_API_KEY || !script.trim()) return fallback;
  const maximumSceneCount = getTargetSceneCount(captions);

  const captionList = captions
    .map((caption, index) => `${index}: ${caption.text}`)
    .join("\n");
  const prompt =
    "Analyze the narration as a high-retention vertical social-drama editor. Extract only visually concrete hook, conflict, evidence, demand, and reveal moments. " +
    "The first cue should represent the earliest strong concrete hook, and later cues should favor visible escalation or reversal over general explanation. " +
    `Create about ${maximumSceneCount} visual cues, prioritizing meaningful moments rather than filler. ` +
    `Return no more than ${maximumSceneCount} items as JSON only: ` +
    '{"scenes":[{"keyword":"반도체 공장","captionText":"반도체 공장은 지금","from":2,"query":"modern semiconductor wafer fabrication plant"}]}. ' +
    "Prioritize a confrontation, shameless demand, hidden money, betrayal, shocked reaction, decisive object, or number-driven event when the script actually contains it. " +
    "Ignore greetings, connectors, reactions, opinions, abstract claims, and repeated mentions. " +
    "keyword must use the narration's original language. captionText must be copied verbatim from exactly one supplied caption line, and from must be that line's index. " +
    `When multiple keywords occur within ${MIN_SCENE_GAP_SECONDS} seconds, keep only the strongest one. ` +
    "Use a concrete English AI-image prompt describing one decisive visible moment, with the setting, subject, action, and important object. Avoid generic stock-photo concepts. " +
    "For every recurring person, choose one concise identity description including approximate age, hairstyle, clothing colors, and role, then repeat that exact description in every query where the person appears. Keep locations and time of day consistent until the narration changes them. " +
    `The final image style is ${getVideoVisualStylePrompt(visualStyle)}. Make each query suitable for that style. ` +
    `${getCulturalVisualDirection(language)} Include that cultural setting in the English AI-image prompt whenever people appear. ` +
    "Do not invent crimes, injuries, documents, money amounts, or people absent from the narration. Do not include a person's name unless it appears in the script.\n\n" +
    `Script:\n${script.slice(0, 3000)}\n\nCaptions:\n${captionList}`;

  try {
    const response = await new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 45_000,
      maxRetries: 0,
    }).responses.create({
      model: IMAGE_SCENE_MODEL,
      input: prompt,
    });
    await recordOpenAIResponseUsage({
      userId,
      operation: "image_scene_plan",
      model: IMAGE_SCENE_MODEL,
      usage: response.usage,
      metadata: {
        scriptLength: script.length,
        captionCount: captions.length,
      },
    });
    const scenes = parseImageScenes(response.output_text, captions);
    return scenes.length > 0
      ? ensureMinimumSceneCoverage(scenes, captions)
      : fallback;
  } catch {
    return fallback;
  }
}

async function resolveImageScenes(
  script: string,
  captions: TimedCaption[],
  userId: string,
  language: ScriptLanguage,
  visualStyle: VideoVisualStyle
) {
  const plannedScenes = await planImageScenes(
    script,
    captions,
    userId,
    language,
    visualStyle
  );
  console.info(
    "Planned visual keyword cues",
    plannedScenes.map((scene) => ({
      keyword: scene.keyword,
      captionIndex: scene.from,
      startsAt: captions[scene.from]?.start ?? 0,
      captionText: scene.captionText,
    }))
  );

  // Visual cues stay sparse, but every selected cue is generated by the image
  // model. This removes external image search/download latency and licensing
  // uncertainty from both manual renders and automatic production.
  return { scenes: plannedScenes, generatedCount: plannedScenes.length };
}

async function generateSceneImage(
  prompt: string,
  outputPath: string,
  userId: string,
  language: ScriptLanguage,
  visualStyle: VideoVisualStyle
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate a missing scene image.");
  }

  let response;
  try {
    response = await new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 120_000,
      maxRetries: 0,
    }).images.generate({
      model: IMAGE_GENERATION_MODEL,
      prompt: `Create one high-retention vertical scene for a social-drama short. Visual style: ${getVideoVisualStylePrompt(visualStyle)}. Show one decisive moment from this prompt: ${prompt}. ${getCulturalVisualDirection(language)} Preserve every supplied age, hairstyle, clothing color, role, location, and time-of-day detail exactly so recurring people and places remain visually consistent across separately generated scenes. Use a clear foreground subject, close or medium framing, expressive body language, visible tension, crisp detail, and strong contrast. Do not add facts, people, money, injuries, or documents not present in the prompt. No violence, gore, sexual content, text, logos, watermarks, collage, or split screen.`,
      size: "1024x1536",
      quality: IMAGE_GENERATION_QUALITY,
      output_format: "jpeg",
      output_compression: 90,
      n: 1,
    });
    await recordApiUsage({
      userId,
      operation: "scene_image_generate",
      model: IMAGE_GENERATION_MODEL,
      metrics: { imageCount: 1 },
      priceVariant: `${IMAGE_GENERATION_QUALITY}:1024x1536`,
      metadata: {
        promptLength: prompt.length,
        visualStyle,
        quality: IMAGE_GENERATION_QUALITY,
      },
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "Unknown image API error";
    throw new Error(`장면 이미지를 생성하지 못했습니다. OpenAI 이미지 생성 권한과 결제 상태를 확인해주세요. ${reason}`);
  }
  const image = response.data?.[0]?.b64_json;

  if (!image) {
    throw new Error("Image generation did not return an image.");
  }

  await writeFile(outputPath, Buffer.from(image, "base64"));
}

function applyRenderedVisualStyle(filter: string, visualStyle: VideoVisualStyle) {
  return visualStyle === "monochrome_2d"
    ? `${filter},hue=s=0,eq=contrast=1.16:brightness=-0.015`
    : filter;
}

function getSceneMotionFilter(duration: number) {
  const frameCount = Math.max(1, Math.round(duration * 30) - 1);
  const progress = `min(n,${frameCount})/${frameCount}`;
  const directions = ["left", "right", "up", "down"] as const;
  const direction = directions[Math.floor(Math.random() * directions.length)];

  const motion =
    direction === "left"
      ? `x='(in_w-out_w)*(0.54-0.08*${progress})':y='(in_h-out_h)/2'`
      : direction === "right"
        ? `x='(in_w-out_w)*(0.46+0.08*${progress})':y='(in_h-out_h)/2'`
        : direction === "up"
          ? `x='(in_w-out_w)/2':y='(in_h-out_h)*(0.54-0.08*${progress})'`
          : `x='(in_w-out_w)/2':y='(in_h-out_h)*(0.46+0.08*${progress})'`;

  return [
    `scale=${MOTION_WIDTH}:${MOTION_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${MOTION_WIDTH}:${MOTION_HEIGHT}`,
    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:${motion}`,
    "eq=contrast=1.07:saturation=1.1:gamma=0.99",
    "setsar=1",
    "fps=30",
  ].join(",");
}

const STATIC_SCENE_FILTER = [
  `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase`,
  `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`,
  "eq=contrast=1.07:saturation=1.1:gamma=0.99",
  "setsar=1",
  "fps=30",
].join(",");

async function encodeSceneClip({
  tempDir,
  imagePath,
  clipPath,
  duration,
  animate,
  visualStyle,
}: {
  tempDir: string;
  imagePath: string;
  clipPath: string;
  duration: number;
  animate: boolean;
  visualStyle: VideoVisualStyle;
}) {
  await execFileAsync(
    getFfmpegPath(),
    [
      ...FFMPEG_BASE_ARGS,
      "-y",
      "-loop",
      "1",
      "-i",
      imagePath,
      "-t",
      duration.toFixed(3),
      "-vf",
      applyRenderedVisualStyle(
        animate ? getSceneMotionFilter(duration) : STATIC_SCENE_FILTER,
        visualStyle
      ),
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "ultrafast",
      "-threads",
      String(FFMPEG_THREADS),
      "-crf",
      "25",
      clipPath,
    ],
    { cwd: tempDir, maxBuffer: FFMPEG_MAX_BUFFER }
  );
}

async function createResolvedImageSceneVideo({
  tempDir,
  captions,
  scenes,
  outputPath,
  userId,
  language,
  visualStyle,
}: {
  tempDir: string;
  captions: TimedCaption[];
  scenes: ResolvedImageScene[];
  outputPath: string;
  userId: string;
  language: ScriptLanguage;
  visualStyle: VideoVisualStyle;
}) {
  const clips: string[] = [];
  let cursor = 0;
  let generatedCount = 0;
  let skippedCount = 0;
  let firstImageError = "";

  // Resolve every asset before building the timeline. This prevents the opening
  // segment from becoming a blank placeholder when the first cue starts later.
  const materializedSources = await mapWithConcurrency(
    scenes,
    SCENE_ASSET_CONCURRENCY,
    async (scene, index) => {
      const imagePath = path.join(tempDir, `scene-${index}.jpg`);
      try {
        await generateSceneImage(
          scene.query,
          imagePath,
          userId,
          language,
          visualStyle
        );
        return "generated" as const;
      } catch (error) {
        firstImageError ||=
          error instanceof Error ? error.message : String(error);
        console.warn("AI scene generation failed", {
          index,
          query: scene.query,
          error,
        });
        return null;
      }
    }
  );

  const firstUsableIndex = materializedSources.findIndex(Boolean);
  if (firstUsableIndex < 0) {
    throw new Error(
      `장면 이미지를 한 장도 준비하지 못했습니다.${firstImageError ? ` 원인: ${firstImageError}` : ""}`
    );
  }
  let lastUsableImagePath = path.join(tempDir, `scene-${firstUsableIndex}.jpg`);

  for (const [index, scene] of scenes.entries()) {
    if (cursor >= captions.length) break;
    if (cursor < scene.from) {
      const gapTo = Math.min(scene.from - 1, captions.length - 1);
      const gapDuration = Math.max(
        0.1,
        captions[gapTo].end - captions[cursor].start
      );
      const gapClipPath = path.join(tempDir, `scene-gap-${index}.mp4`);

      await encodeSceneClip({
        tempDir,
        imagePath: lastUsableImagePath,
        clipPath: gapClipPath,
        duration: gapDuration,
        animate: false,
        visualStyle,
      });
      clips.push(gapClipPath);
      cursor = scene.from;
    }

    const from = Math.max(cursor, scene.from);
    const to = Math.max(from, Math.min(scene.to, captions.length - 1));
    const duration = Math.max(0.8, captions[to].end - captions[from].start);
    const imagePath = path.join(tempDir, `scene-${index}.jpg`);
    const clipPath = path.join(tempDir, `scene-${index}.mp4`);
    const source = materializedSources[index];

    if (!source) {
      skippedCount += 1;
      try {
        await encodeSceneClip({
          tempDir,
          imagePath: lastUsableImagePath,
          clipPath,
          duration,
          animate: false,
          visualStyle,
        });
        clips.push(clipPath);
      } catch (error) {
        console.warn("Fallback scene encoding failed", {
          index,
          query: scene.query,
          error,
        });
        throw new Error("Could not preserve the timing of a missing image scene.");
      }
      cursor = to + 1;
      continue;
    }

    try {
      await encodeSceneClip({
        tempDir,
        imagePath,
        clipPath,
        duration,
        animate: true,
        visualStyle,
      });
    } catch (error) {
      console.warn("Scene clip encoding failed; preserving timeline", {
        index,
        query: scene.query,
        error,
      });
      skippedCount += 1;
      try {
        await encodeSceneClip({
          tempDir,
          imagePath: lastUsableImagePath,
          clipPath,
          duration,
          animate: false,
          visualStyle,
        });
        clips.push(clipPath);
      } catch (fallbackError) {
        console.warn("Fallback scene encoding failed", {
          index,
          query: scene.query,
          error: fallbackError,
        });
        throw new Error("Could not preserve the timing of a failed image scene.");
      }
      cursor = to + 1;
      continue;
    }

    clips.push(clipPath);
    lastUsableImagePath = imagePath;
    if (source === "generated") generatedCount += 1;
    cursor = to + 1;
  }

  if (clips.length === 0) {
    throw new Error("No usable images were available for the video scenes.");
  }

  const concatPath = path.join(tempDir, "scene-list.txt");
  await writeFile(
    concatPath,
    clips.map((clip) => `file '${clip.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
    "utf-8"
  );
  await execFileAsync(
    getFfmpegPath(),
    [
      ...FFMPEG_BASE_ARGS,
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-c",
      "copy",
      outputPath,
    ],
    { cwd: tempDir, maxBuffer: FFMPEG_MAX_BUFFER }
  );

  return {
    sceneCount: clips.length,
    generatedCount,
    skippedCount,
  };
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
      key: `render-video:${user.id}`,
      limit: 3,
      windowMs: 10 * 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    console.log("========== 영상 합성 시작 ==========");

    const body = (await readJsonBody(req, 256 * 1024)) as {
      visualMode?: unknown;
      visualStyle?: unknown;
      script?: unknown;
      language?: unknown;
      backgroundUrl?: unknown;
      backgroundPlaybackSpeed?: unknown;
      isBackgroundReversed?: unknown;
      audioUrl?: unknown;
      timedCaptions?: unknown;
      captionEmphasis?: unknown;
      autoCreate?: unknown;
      projectId?: unknown;
    };
    const { backgroundUrl, audioUrl, timedCaptions, captionEmphasis } = body;
    const visualMode = body.visualMode === "images" ? "images" : "background";
    const visualStyle = getSafeVideoVisualStyle(body.visualStyle);
    const script = typeof body.script === "string" ? body.script.trim() : "";
    const language = getSafeScriptLanguage(body.language);
    const backgroundPlaybackSpeed = getSafeBackgroundPlaybackSpeed(
      body.backgroundPlaybackSpeed
    );
    const isBackgroundReversed = body.isBackgroundReversed === true;
    const isAutoCreate = body.autoCreate === true;
    const projectId =
      typeof body.projectId === "string" && PROJECT_ID_PATTERN.test(body.projectId)
        ? body.projectId
        : "";

    if (!projectId) {
      return NextResponse.json(
        { error: "완성 영상을 저장할 프로젝트가 없습니다." },
        { status: 400 }
      );
    }

    const projectClient = createAdminClient();
    const { data: ownedProject, error: projectError } = await projectClient
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError || !ownedProject) {
      return NextResponse.json(
        { error: "완성 영상을 저장할 프로젝트를 찾지 못했습니다." },
        { status: 404 }
      );
    }

    if (isAutoCreate) {
      const supabase = createAdminClient();
      const { data: planRow, error: planError } = await supabase
        .from("user_plans")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        planError ||
        (planRow?.plan !== "starter" && planRow?.plan !== "pro")
      ) {
        return NextResponse.json(
          { error: "자동 제작은 Starter 이상에서 사용할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    if (visualMode === "background" && !isStringWithinLimit(backgroundUrl, 2_048)) {
      return NextResponse.json(
        { error: "배경 영상 URL이 없습니다." },
        { status: 400 }
      );
    }

    if (!isStringWithinLimit(audioUrl, 2_048)) {
      return NextResponse.json(
        { error: "음성 파일 URL이 없습니다." },
        { status: 400 }
      );
    }

    if (!Array.isArray(timedCaptions) || timedCaptions.length === 0) {
      return NextResponse.json(
        { error: "자막 타임스탬프가 없습니다." },
        { status: 400 }
      );
    }

    if (
      timedCaptions.some(
        (caption) =>
          !caption ||
          typeof caption !== "object" ||
          !("text" in caption) ||
          typeof caption.text !== "string" ||
          !("start" in caption) ||
          !("end" in caption) ||
          typeof caption.start !== "number" ||
          typeof caption.end !== "number"
      )
    ) {
      return NextResponse.json(
        { error: "자막 타임스탬프 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const renderCaptions = compressTimedCaptions(
      timedCaptions as TimedCaption[]
    );

    if (
      renderCaptions.length === 0 ||
      renderCaptions.length > 500 ||
      renderCaptions.some((caption) => caption.text.length > 200)
    ) {
      return NextResponse.json(
        { error: "자막을 영상용으로 정리하지 못했습니다. 대본 길이를 줄여주세요." },
        { status: 400 }
      );
    }

    const renderAction =
      visualMode === "images" ? "render_image_video" : "render_video";
    let resolvedImageScenes: ResolvedImageScene[] = [];
    let generatedSceneImageCount = 0;
    let skippedSceneImageCount = 0;
    const renderCredits =
      visualMode === "images"
        ? isAutoCreate
          ? AUTO_CREATE_IMAGE_VIDEO_CREDITS
          : IMAGE_VIDEO_CREDITS
        : undefined;

    await ensureCreditsAvailable({
      userId: user.id,
      action: renderAction,
      requiredCredits: renderCredits,
    });

    await recordCreditUsage({
      userId: user.id,
      action: renderAction,
        metadata: {
          visualMode,
          visualStyle,
        captionCount: renderCaptions.length,
        chargedAtRequest: true,
      },
      creditsOverride: renderCredits,
    });

    if (visualMode === "images") {
      const resolved = await resolveImageScenes(
        script,
        renderCaptions,
        user.id,
        language,
        visualStyle
      );
      resolvedImageScenes = resolved.scenes;
      generatedSceneImageCount = resolved.generatedCount;
    }

    tempDir = path.join(os.tmpdir(), `shorts-render-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const backgroundPath = path.join(tempDir, "background.mp4");
    const processedBackgroundPath = path.join(tempDir, "background-processed.mp4");
    const audioPath = path.join(tempDir, "audio.mp3");
    const subtitlePath = path.join(tempDir, "subtitle.ass");
    const outputPath = path.join(tempDir, "output.mp4");

    let renderBackgroundPath = backgroundPath;

    if (visualMode === "images") {
      console.log("1. 이미지 장면 생성 시작");
      const sceneResult = await createResolvedImageSceneVideo({
        tempDir,
        captions: renderCaptions,
        scenes: resolvedImageScenes,
        outputPath: backgroundPath,
        userId: user.id,
        language,
        visualStyle,
      });
      generatedSceneImageCount = sceneResult.generatedCount;
      skippedSceneImageCount = sceneResult.skippedCount;
    } else {
      console.log("1. 배경 영상 다운로드 시작");
      await downloadStorageFile({
        url: backgroundUrl as string,
        outputPath: backgroundPath,
        bucket: "background-videos",
        userId: user.id,
        maxBytes: 50 * 1024 * 1024,
        timeoutMs: 60_000,
      });
    }

    if (visualMode === "background" && isBackgroundReversed) {
      console.log("1-1. 諛곌꼍 ?곸긽 ?뱀옱??泥섎━ ?쒖옉");

      await execFileAsync(
        getFfmpegPath(),
        [
          ...FFMPEG_BASE_ARGS,
          "-y",
          "-i",
          backgroundPath,
          "-vf",
          "reverse",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",

          "-threads",
          String(FFMPEG_THREADS),
          "-crf",
          "25",
          processedBackgroundPath,
        ],
        {
          cwd: tempDir,
          maxBuffer: FFMPEG_MAX_BUFFER,
        }
      );

      renderBackgroundPath = processedBackgroundPath;
    }

    console.log("2. 음성 파일 다운로드 시작");
    await downloadStorageFile({
      url: audioUrl as string,
      outputPath: audioPath,
      bucket: "tts-audio",
      userId: user.id,
      maxBytes: 20 * 1024 * 1024,
    });

    console.log("3. 자막 파일 생성 시작");
    const subtitle = createSubtitleAssContent({
      timedCaptions: renderCaptions,
      captionEmphasis,
    });
    await writeFile(subtitlePath, subtitle.assContent, "utf-8");
    console.log("자막 개수:", subtitle.captionCount);
    console.log("강조 적용 자막 개수:", subtitle.emphasizedCaptionCount);
    console.log("자막 파일 경로:", subtitlePath);

    console.log("4. ffmpeg 합성 시작");

    const ffmpegArgs = [
      ...FFMPEG_BASE_ARGS,
      "-y",

      "-stream_loop",
      "-1",
      "-i",
      renderBackgroundPath,

      "-i",
      audioPath,

      "-filter_complex",
      `[0:v]${backgroundPlaybackSpeed === 1 ? "" : `setpts=PTS/${backgroundPlaybackSpeed},`}scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,subtitles=subtitle.ass[v]`,

      "-map",
      "[v]",

      "-map",
      "1:a:0",

      "-c:v",
      "libx264",

      "-pix_fmt",
      "yuv420p",

      "-aspect",
      "9:16",

      "-metadata:s:v:0",
      "rotate=0",

      "-preset",
      "ultrafast",

      "-threads",
      String(FFMPEG_THREADS),

      "-crf",
      "27",

      "-c:a",
      "aac",

      "-b:a",
      "192k",

      "-shortest",

      "-movflags",
      "+faststart",

      outputPath,
    ];

    console.log("ffmpeg args:", ffmpegArgs.join(" "));

    await execFileAsync(getFfmpegPath(), ffmpegArgs, {
      cwd: tempDir,
      maxBuffer: FFMPEG_MAX_BUFFER,
    });

    console.log("5. ffmpeg 합성 완료");

    const outputStats = await stat(outputPath);

    console.log("6. 결과 파일 스트리밍 준비 완료");
    console.log("결과 파일 크기:", outputStats.size);
    console.log("========== 영상 합성 완료 ==========");

    const finalVideoPath = `${user.id}/${projectId}/final-${crypto.randomUUID()}.mp4`;
    const finalVideo = await readFile(outputPath);
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("final-videos")
      .upload(finalVideoPath, finalVideo, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`완성 영상 저장 실패: ${uploadError.message}`);
    }

    const { data: publicUrlData } = admin.storage
      .from("final-videos")
      .getPublicUrl(finalVideoPath);

    return NextResponse.json({
      finalVideoPath,
      finalVideoUrl: publicUrlData.publicUrl,
      finalVideoSize: outputStats.size,
      generatedImageCount: generatedSceneImageCount,
      skippedImageCount: skippedSceneImageCount,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const creditResponse = getCreditErrorResponse(error);
    if (creditResponse) return creditResponse;

    await recordOperationFailure({
      userId,
      stage: "video_render",
      error,
    });

    console.log("========== 영상 합성 에러 ==========");
    console.error(error);

    const err = error as {
      message?: string;
      stderr?: string;
      stdout?: string;
      code?: number;
    };

    const message = isFfmpegMissingError(error)
      ? getFfmpegMissingMessage()
      : err.stderr || err.message || "영상 합성 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        error: message.slice(0, 3000),
      },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
