import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { recordApiUsage } from "@/lib/api-usage/record";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import {
  VIDEO_VISUAL_STYLE_OPTIONS,
  getVideoVisualStylePrompt,
} from "@/lib/visuals/styles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MODEL = "gpt-image-2";
const QUALITY = "medium" as const;
const DEFAULT_SCENE = `
Create a restrained dramatic scene in a contemporary middle-class South Korean apartment dining room.

LOCKED CAST AND BLOCKING:
- Exactly four Korean adults, no children and no extra people.
- Foreground center: a believable 58-year-old mother with short black hair and a plain navy cardigan, seated at the table.
- She holds one small green bankbook with both hands at chest height and looks quietly stunned, not terrified.
- Background left: her adult daughter, age 32. Background center: her husband, age 61. Background right: her adult son, age 29.
- The three background family members remain standing, concerned and silent.

LOCKED CAMERA AND COMPOSITION:
- Vertical 2:3 frame, eye-level medium shot, 50mm-equivalent lens.
- Mother fills about 55% of frame height; all four faces remain visible.
- Dining table edge at the bottom, modest apartment kitchen behind them, soft evening window light from camera-left.
- Natural asymmetry and restrained expressions. This is a serious family drama, not horror or comedy.

STRICT EXCLUSIONS:
- No text, letters, numbers, logos, watermark, split screen, collage, duplicated people, extra fingers, distorted hands, fisheye lens, extreme close-up, screaming, bulging eyes, theatrical shock, luxury interior, or fantasy props.
`;

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }

  const user = await getAuthenticatedApiUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY_MISSING" }, { status: 503 });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 120_000,
    maxRetries: 0,
  });

  const images = await mapWithConcurrency(
    VIDEO_VISUAL_STYLE_OPTIONS,
    2,
    async (option) => {
      try {
        const response = await client.images.generate({
          model: MODEL,
          prompt: `${DEFAULT_SCENE}\n\nApply only this visual treatment while preserving every locked cast, blocking, prop, camera, and composition requirement:\n${getVideoVisualStylePrompt(option.value)}`,
          size: "1024x1536",
          quality: QUALITY,
          output_format: "jpeg",
          output_compression: 90,
          n: 1,
        });
        const base64 = response.data?.[0]?.b64_json;
        if (!base64) throw new Error("EMPTY_IMAGE");

        await recordApiUsage({
          userId: user.id,
          operation: "visual_style_test",
          model: MODEL,
          metrics: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
            imageCount: 1,
          },
          metadata: {
            visualStyle: option.value,
            quality: QUALITY,
            size: "1024x1536",
          },
        });

        return {
          style: option.value,
          ko: option.ko,
          en: option.en,
          imageUrl: `data:image/jpeg;base64,${base64}`,
          error: "",
        };
      } catch (error) {
        await recordApiUsage({
          userId: user.id,
          operation: "visual_style_test",
          model: MODEL,
          status: "failed",
          metadata: {
            visualStyle: option.value,
            message: error instanceof Error ? error.message : String(error),
          },
        });

        return {
          style: option.value,
          ko: option.ko,
          en: option.en,
          imageUrl: "",
          error: error instanceof Error ? error.message : "IMAGE_FAILED",
        };
      }
    }
  );

  return NextResponse.json({ images, model: MODEL, quality: QUALITY });
}
