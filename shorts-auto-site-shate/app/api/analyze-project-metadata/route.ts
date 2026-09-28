import OpenAI from "openai";
import { APP_TEXT_MODEL } from "@/lib/openai/models";
import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { recordOpenAIResponseUsage } from "@/lib/api-usage/record";
import { recordOperationFailure } from "@/lib/operations/failures";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";

const METADATA_MODEL = APP_TEXT_MODEL;

function cleanValue(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function fallbackMetadata(script: string) {
  const firstSentence = script
    .split(/[\n.!?。！？]/)[0]
    ?.replace(/^[\s"'“”]+|[\s"'“”]+$/g, "")
    .trim();
  const title = (firstSentence || "새 쇼츠 프로젝트").slice(0, 80);

  return { title, topic: title };
}

function parseMetadata(value: string, script: string) {
  try {
    const parsed = JSON.parse(
      value.trim().replace(/^```json\s*|\s*```$/g, "")
    ) as Record<string, unknown>;
    const fallback = fallbackMetadata(script);

    return {
      title: cleanValue(parsed.title, 100) || fallback.title,
      topic: cleanValue(parsed.topic, 160) || fallback.topic,
    };
  } catch {
    return fallbackMetadata(script);
  }
}

export async function POST(request: Request) {
  let userId: string | null = null;

  try {
    const user = await getAuthenticatedApiUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    userId = user.id;

    const rateLimitResponse = enforceRateLimit({
      key: `analyze-project-metadata:${user.id}`,
      limit: 12,
      windowMs: 60_000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(request, 8 * 1024)) as { script?: unknown };
    if (!isStringWithinLimit(body.script, 3_000)) {
      return NextResponse.json({ error: "분석할 대본을 확인해주세요." }, { status: 400 });
    }

    const script = typeof body.script === "string" ? body.script.trim() : "";
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model: METADATA_MODEL,
      input:
        "Analyze this short-form narration and return JSON only. " +
        "Use the narration's language. Do not invent facts. " +
        "title: an engaging, specific YouTube-ready title under 80 characters. " +
        "topic: a concise subject summary under 120 characters. " +
        'Return exactly {"title":"...","topic":"..."}.\n\nNarration:\n' +
        script,
    });

    await recordOpenAIResponseUsage({
      usage: response.usage,
      userId: user.id,
      operation: "project_metadata_analyze",
      model: METADATA_MODEL,
      metadata: { scriptLength: script.length },
    });

    return NextResponse.json(parseMetadata(response.output_text, script));
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    await recordOperationFailure({
      userId,
      stage: "project_metadata_analyze",
      error,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "제목과 주제 분석에 실패했습니다." },
      { status: 500 }
    );
  }
}
