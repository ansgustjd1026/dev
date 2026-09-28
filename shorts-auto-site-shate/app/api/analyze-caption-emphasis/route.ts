import OpenAI from "openai";
import { CAPTION_EMPHASIS_MODEL } from "@/lib/openai/models";
import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { recordOperationFailure } from "@/lib/operations/failures";
import { recordOpenAIResponseUsage } from "@/lib/api-usage/record";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";
import { normalizeCaptionEmphasisPoints } from "@/lib/captions/emphasis";

const EMPHASIS_MODEL = CAPTION_EMPHASIS_MODEL;

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getEmphasisPointRange(script: string) {
  const sentenceCount = Math.max(
    1,
    script
      .split(/(?<=[.!?。！？])\s+|\n+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean).length
  );
  const maxPoints = Math.min(24, Math.max(2, sentenceCount));

  return {
    minPoints: Math.min(maxPoints, Math.max(1, Math.ceil(sentenceCount / 2))),
    maxPoints,
  };
}

function parseEmphasisResponse(value: string, script: string, maxPoints: number) {
  try {
    const parsed = JSON.parse(stripJsonFence(value)) as {
      points?: unknown;
    };

    return normalizeCaptionEmphasisPoints(parsed.points, script, maxPoints);
  } catch {
    return [];
  }
}

async function analyzeCaptionEmphasis(script: string, userId: string) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { minPoints, maxPoints } = getEmphasisPointRange(script);
  const prompt =
    "너는 한국어 쇼츠 편집자다. 아래 내레이션 대본에서 자막으로 강조하면 좋은 짧은 구간을 골라라. " +
    "반드시 대본에 실제로 존재하는 연속된 원문 일부만 text로 사용해라. " +
    "효과 effect는 highlight, impact, burst, pop, clean 중 하나만 써라. " +
    "첫 훅은 pop, 뻔뻔한 요구·금액·갈등은 highlight, 배신이나 숨은 속셈이 드러나는 반전은 impact를 우선한다. " +
    "대본 전체에서 가장 자극적인 한두 지점(충격적인 금액, 들통, 반전, 폭로)에만 burst를 써라. burst를 남발하지 마라. clean은 꼭 필요한 정보에만 사용한다. " +
    "사건과 무관한 감탄사나 평범한 연결 문장은 고르지 마라. " +
    `문장 2개마다 반드시 1~2개씩, 전체 ${minPoints}~${maxPoints}개를 고르게 배치해라. ` +
    "같은 문장에서는 서로 겹치지 않는 핵심 단어나 짧은 구절만 고르고, 문장 전체를 강조하지 마라. text는 2~18자 정도로 골라라. " +
    "응답은 JSON만 출력해라. 형식: {\"points\":[{\"text\":\"...\",\"effect\":\"highlight\",\"reason\":\"...\"}]}\n\n" +
    `대본:\n${script}`;

  const response = await openai.responses.create({
    model: EMPHASIS_MODEL,
    input: prompt,
  });
  await recordOpenAIResponseUsage({
    userId,
    operation: "caption_emphasis_analyze",
    model: EMPHASIS_MODEL,
    usage: response.usage,
    metadata: { scriptLength: script.length },
  });

  return parseEmphasisResponse(response.output_text, script, maxPoints);
}

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
      key: `analyze-caption-emphasis:${user.id}`,
      limit: 12,
      windowMs: 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(req, 12 * 1024)) as {
      script?: unknown;
    };

    if (!isStringWithinLimit(body.script, 4_000)) {
      return NextResponse.json(
        { error: "대본은 4,000자 이하여야 합니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const script = typeof body.script === "string" ? body.script.trim() : "";
    const points = await analyzeCaptionEmphasis(script, user.id);

    return NextResponse.json({
      points,
      usedModel: EMPHASIS_MODEL,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    await recordOperationFailure({
      userId,
      stage: "caption_emphasis_analyze",
      error,
    });

    let message = "자막 강조 포인트 분석 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
