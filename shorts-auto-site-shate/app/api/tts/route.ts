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
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";

export async function POST(req: Request) {
  let userId: string | null = null;
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
      key: `tts:${user.id}`,
      limit: 5,
      windowMs: 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(req, 16 * 1024)) as {
      text?: unknown;
      voice?: unknown;
    };
    const { text, voice } = body;

    if (!isStringWithinLimit(text, 4_000)) {
      return NextResponse.json(
        { error: "TTS 대본은 1자 이상 4,000자 이하여야 합니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const allowedVoices = ["alloy", "nova", "shimmer", "echo", "onyx", "fable"];
    const selectedVoice =
      typeof voice === "string" && allowedVoices.includes(voice)
        ? voice
        : "nova";

    await ensureCreditsAvailable({
      userId: user.id,
      action: "tts_generate",
    });

    await recordCreditUsage({
      userId: user.id,
      action: "tts_generate",
      metadata: {
        voice: selectedVoice,
        inputLength: typeof text === "string" ? text.length : 0,
        chargedAtRequest: true,
      },
    });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: selectedVoice,
      input: text as string,
    });
    await recordApiUsage({
      userId: user.id,
      operation: "speech_generate",
      model: "tts-1",
      metrics: { inputCharacters: (text as string).length },
      metadata: { voice: selectedVoice },
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "inline; filename=tts.mp3",
      },
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const creditResponse = getCreditErrorResponse(error);
    if (creditResponse) return creditResponse;

    await recordOperationFailure({
      userId,
      stage: "speech_generate",
      error,
    });

    let message = "TTS 생성 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
