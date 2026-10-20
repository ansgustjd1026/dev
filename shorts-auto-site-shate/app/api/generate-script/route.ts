import OpenAI from "openai";
import { NextResponse } from "next/server";
import { APP_TEXT_MODEL } from "@/lib/openai/models";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { recordOperationFailure } from "@/lib/operations/failures";
import { recordOpenAIResponseUsage } from "@/lib/api-usage/record";
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
import { normalizeSpokenText } from "@/lib/captions/spoken-text";
import { createTopicSeed } from "@/lib/scripts/topic-seed";
import {
  getSafeVideoVisualStyle,
  type VideoVisualStyle,
} from "@/lib/visuals/styles";

const SCRIPT_MODEL = APP_TEXT_MODEL;
const SCRIPT_MAX_LENGTH = 3000;

type ScriptLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";

const SCRIPT_LANGUAGE_LABELS: Record<ScriptLanguage, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  fr: "French",
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

function getLanguageInstruction(language: ScriptLanguage) {
  const label = SCRIPT_LANGUAGE_LABELS[language];

  return (
    `Write the final output only in ${label}. ` +
    "Keep the same viral short-form structure, but localize expressions so they sound natural to native speakers. " +
    "Do not include translations, language labels, romanization, explanations, markdown, or bracketed stage directions."
  );
}

function getFallbackTopic(language: ScriptLanguage) {
  if (language === "en") {
    return "Is it fair when a friend says they are broke but buys coffee every day?";
  }

  if (language === "ja") {
    return "お金がないと言いながら毎日カフェに行く友達は許せるか";
  }

  if (language === "zh") {
    return "一边说没钱一边每天买咖啡的朋友该理解吗";
  }

  if (language === "es") {
    return "¿Hay que entender a un amigo que dice no tener dinero pero compra café todos los días?";
  }

  if (language === "fr") {
    return "Faut-il comprendre un ami qui dit ne pas avoir d'argent mais achète du café tous les jours ?";
  }

  return "돈 없다면서 카페는 매일 가는 친구는 이해해야 할까";
}

type LengthGuide = {
  prompt: string;
  minimumCharacters: number;
  targetDurationSeconds: number;
};

function getSafeDurationSeconds(durationSeconds: unknown, length: unknown) {
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    return Math.min(120, Math.max(30, Math.round(durationSeconds)));
  }

  if (length === "short") return 30;
  if (length === "long") return 120;

  return 60;
}

function getLengthGuide(
  durationSeconds: number,
  language: ScriptLanguage
): LengthGuide {
  const lowerDuration = Math.max(30, Math.round(durationSeconds * 0.92));
  const upperDuration = Math.min(120, Math.round(durationSeconds * 1.08));
  const koreanDurationText =
    lowerDuration === upperDuration
      ? `${durationSeconds}초`
      : `${lowerDuration}~${upperDuration}초`;
  const englishDurationText =
    lowerDuration === upperDuration
      ? `${durationSeconds} seconds`
      : `${lowerDuration}-${upperDuration} seconds`;

  if (language === "ko") {
    const minChars = Math.round(durationSeconds * 6.3);
    const maxChars = Math.round(durationSeconds * 8.2);

    return {
      prompt: `약 ${koreanDurationText} 분량, 공백 제외 ${minChars}자 이상 ${maxChars}자 이하`,
      minimumCharacters: Math.round(minChars * 0.88),
      targetDurationSeconds: durationSeconds,
    };
  }

  if (language === "ja" || language === "zh") {
    const minChars = Math.round(durationSeconds * 4.8);
    const maxChars = Math.round(durationSeconds * 6.5);

    return {
      prompt: `about ${englishDurationText}, ${minChars}-${maxChars} characters excluding spaces`,
      minimumCharacters: Math.round(minChars * 0.88),
      targetDurationSeconds: durationSeconds,
    };
  }

  const wordsPerSecond = language === "es" || language === "fr" ? 2.45 : 2.35;
  const minWords = Math.round(durationSeconds * wordsPerSecond * 0.86);
  const maxWords = Math.round(durationSeconds * wordsPerSecond * 1.08);

  return {
    prompt: `about ${englishDurationText}, ${minWords}-${maxWords} spoken words`,
    minimumCharacters: Math.round(minWords * 4.2),
    targetDurationSeconds: durationSeconds,
  };
}

function getComparableLength(script: string, language: ScriptLanguage) {
  if (language === "ko" || language === "ja" || language === "zh") {
    return script.replace(/\s/g, "").length;
  }

  return script.length;
}

function cleanTopic(topic: string) {
  return topic
    .replace(/```(?:\w+)?/g, "")
    .replace(/```/g, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^\s*(주제|제목|topic|title|テーマ|タイトル|主题|标题)\s*[:：]\s*/i, "")
    .trim();
}

function cleanScript(script: string) {
  return normalizeSpokenText(
    script
    .replace(/```(?:\w+)?/g, "")
    .replace(/```/g, "")
    .replace(
      /^\s*(제목|대본|내레이션|나레이션|title|script|narration|タイトル|台本|ナレーション|标题|脚本|旁白)\s*[:：]\s*/gim,
      ""
    )
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
  );
}

async function generateRandomTopic(
  openai: OpenAI,
  language: ScriptLanguage,
  userId: string,
  visualStyle: VideoVisualStyle
) {
  const seed = createTopicSeed(visualStyle);
  const audienceBrief =
    visualStyle === "webtoon"
      ? "역할: 10~20대가 바로 공감할 현실 밀착형 웹툰 숏폼 기획자.\n" +
        "10~20대가 이해하기 쉬운 표현을 쓰되, 아래에서 선택한 관계와 장소를 유지한다. 미성년 인물의 성적 소재는 사용하지 않는다.\n"
      : "역할: 50~60대 시청자가 공감할 다양한 일상 이야기를 만드는 숏폼 기획자.\n" +
        "연령대는 표현의 친숙함을 위한 기준이다. 등장인물의 연령이나 가족 관계를 고정하지 않는다.\n";

  const response = await openai.responses.create({
    model: SCRIPT_MODEL,
    input:
      getLanguageInstruction(language) +
      "\n\n" +
      audienceBrief +
      `이번 요청에서 무작위로 선택한 소재:\n분야: ${seed.category}\n관계: ${seed.relationship}\n장소: ${seed.place}\n갈등: ${seed.conflict}\n` +
      "선택한 관계·장소·갈등을 모두 사용해 하나의 자연스러운 사건으로 구체화한다. 다른 분야나 관계로 바꾸지 않는다.\n" +
      "과제: 실제 주변에서 벌어질 법한 갈등 한 장면을 주제 한 문장으로 만든다.\n" +
      "선택한 갈등에서 긴장감을 만든다. 자녀의 돈 요구, 숨긴 재산, 전세금, 해외여행 폭로 같은 별개의 사건을 임의로 덧붙이지 않는다.\n" +
      "조건: 관계와 행동이 눈에 보이게 구체적으로 쓰고, 누가 더 잘못했는지 편이 갈려야 한다. " +
      "세대 전체를 비난하지 말고 한 사건으로 좁힌다. 추상적 사회 비평은 금지한다.\n" +
      "금지: 실제 인물·브랜드·사건, 정치, 혐오, 성적 모욕, 범죄 조장, 허위 의료·금융 정보.\n" +
      "출력: 제목·번호·설명·따옴표 없이 주제 한 문장만.",
  });
  await recordOpenAIResponseUsage({
    userId,
    operation: "script_topic_generate",
    model: SCRIPT_MODEL,
    usage: response.usage,
    metadata: { language, visualStyle, ...seed },
  });

  const topic = cleanTopic(response.output_text || "");

  if (!topic) {
    return getFallbackTopic(language);
  }

  return topic;
}

async function callOpenAI(
  openai: OpenAI,
  topic: string,
  lengthGuide: LengthGuide,
  language: ScriptLanguage,
  mode: "first" | "expand",
  userId: string,
  previousScript = "",
  visualStyle: VideoVisualStyle = "cinematic",
  topicSource: "user" | "generated" = "generated"
) {
  const isWebtoon = visualStyle === "webtoon";
  const audienceRole = isWebtoon
    ? "역할: 10~20대가 바로 공감하고 반응할 현실 관계형 웹툰 숏폼 내레이션 작가.\n"
    : "역할: 50~60대가 바로 이해하고 반응할 다양한 일상 숏폼 내레이션 작가.\n";
  const audienceRules = isWebtoon
    ? "- 주제에 연령이나 관계가 명시되지 않은 경우에만 학생, 대학생, 사회초년생 등 10~20대가 공감할 맥락으로 보완한다.\n" +
      "- 연애·입시·가족·친구 소재는 주제에 포함되어 있거나 자연스럽게 필요한 경우에만 사용한다. 미성년 인물의 성적 소재는 사용하지 않는다.\n"
    : "- 주제에 연령이나 생활 맥락이 명시되지 않은 경우에만 50~60대가 이해하기 쉬운 현실 생활 장면으로 보완한다.\n" +
      "- 가족·돈·이웃·직장·자영업 소재는 주제에 포함되어 있거나 자연스럽게 필요한 경우에만 사용한다. 할아버지·할머니, 와병·간병, 상속은 주제가 직접 요구할 때만 사용한다.\n";
  const ageRule =
    "- 도입부에서 인물의 나이를 밝히지 않는다. '저는 58살입니다', '스무 살인 저는', '40대 남편은'처럼 나이로 시작하지 말고 사건이나 대사로 바로 시작한다. 나이는 사건 이해에 반드시 필요할 때만 중반 이후 한 번 쓴다.\n";
  const stylePriorityRule = isWebtoon
    ? "스타일 규칙: 웹툰은 표현 방식과 기본 독자층만 정한다. 주제의 인물·관계·사건을 다른 웹툰 단골 소재로 교체하지 않는다. 주제에 연령이 없을 때만 10~20대 독자에게 자연스러운 말투를 쓴다. 도입부에는 등장인물의 나이를 쓰지 않는다."
    : "스타일 규칙: 시각 스타일과 기본 말투는 주제의 내용을 변경하지 않는다. 도입부에는 등장인물의 나이를 쓰지 않는다.";
  const topicPriorityRule =
    "주제 충실도 최우선 규칙:\n" +
    `- 원문 주제: ${topic}\n` +
    "- 원문에 명시된 인물, 관계, 사건, 장소, 물건, 행동, 수치, 관점과 질문을 빠뜨리거나 다른 소재로 바꾸지 않는다.\n" +
    "- 모든 문장과 장면은 원문 주제를 설명하거나 전개하는 데 직접 기여해야 한다.\n" +
    "- 원문에 없는 돈 문제, 가족 갈등, 편애, 불륜, 배신, 상속, 입시, 연애를 흥미를 위해 임의로 추가하지 않는다.\n" +
    "- 주제가 정보·후기·설명·비교를 요구하면 억지로 막장 사연으로 바꾸지 말고 그 형식에 맞춘다.\n" +
    "- 연령대, 영상 스타일, 흥미 구조와 충돌할 때는 안전 규칙을 제외하고 원문 주제의 내용이 우선한다.\n" +
    (topicSource === "user"
      ? "- 사용자가 직접 입력한 주제이므로 주제 확장은 가능하지만 주제 변경이나 대체는 절대 금지한다.\n"
      : "- 자동 생성된 주제라도 핵심 사건과 관계를 끝까지 유지한다.\n");
  const prompt =
    getLanguageInstruction(language) +
    "\n\n" +
    topicPriorityRule +
    "\n" +
    (mode === "first"
      ? audienceRole +
        `분량: ${lengthGuide.prompt}. 글자 수보다 실제 발화 시간을 우선한다.\n` +
        "목표: 첫 1초에 원문 주제가 약속한 내용을 분명히 보여주고, 끝까지 같은 주제를 전개해 자연스러운 반응을 이끈다.\n" +
        "이야기 규칙:\n" +
        "- 먼저 주제가 갈등 사연, 정보 설명, 후기·경험, 비교, 질문·의견 중 무엇인지 판단하고 그 형식으로 쓴다.\n" +
        "- 갈등 사연일 때만 실제 주변에서 벌어질 법한 익명의 사건 하나로 만든다. 정보·후기·비교 주제를 가상의 가족 갈등으로 바꾸지 않는다.\n" +
        audienceRules +
        ageRule +
        "- 갈등형 사연은 주제에 이미 있는 행동과 이해관계로 긴장감을 만든다. 별도의 돈 문제나 배신을 추가하지 않는다.\n" +
        "- 황당하지만 현실에서 충분히 있을 법해야 한다. 사건이나 갈등을 여러 개 섞지 않는다.\n" +
        "구조:\n" +
        "- 갈등 사연: 핵심 행동이나 대사로 시작하고, 관계와 상황, 갈등 확대, 본질이나 반전, 판단 질문 순서로 쓴다.\n" +
        "- 정보 설명: 핵심 결론이나 놀라운 사실로 시작하고, 이유와 구체적 근거, 적용 방법이나 주의점으로 마친다.\n" +
        "- 후기·경험: 결과를 먼저 보여주고, 계기와 과정, 실제 변화, 솔직한 결론으로 마친다.\n" +
        "- 비교·질문: 차이 또는 쟁점을 먼저 보여주고, 양쪽 근거를 구체적으로 비교한 뒤 주제에 맞는 결론이나 질문으로 마친다.\n" +
        "문체: 쉬운 구어체를 쓰되 짧은 말조각을 나열하지 않는다. 한 문장에는 하나의 행동이나 반응을 담고, 앞뒤 문장이 원인과 결과로 자연스럽게 이어져야 한다. " +
        "'그리고', '그런데', '그러자' 같은 접속어를 연달아 반복하지 않는다. 뉴스·칼럼·교훈 말투와 주장 나열은 금지한다. " +
        "숫자와 단위는 한 덩어리로 쓴다. 예: '2,400만 원', '80만 원', '3.5배'. 숫자 안의 쉼표·소수점 주변에 공백을 넣지 않는다. " +
        "의미가 끝나는 곳에만 쉼표와 마침표를 쓴다. " +
        "직접 인용과 따옴표는 꼭 필요할 때 한 번만 쓴다. 모든 문장을 고함처럼 쓰지 말고 장면-압박-반전의 속도 차이를 둔다.\n" +
        "안전: 세대·성별·지역 등 집단을 공격하지 않는다. 실제 인물·브랜드·사건을 만들지 않는다. " +
        "허위 사실, 혐오, 범죄·자해 조장, 성적 모욕, 의료·금융 단정은 금지한다. 일반화된 가상 사례로 쓴다.\n" +
        "출력: 제목, 번호, 괄호, 장면 지시, 내레이션 표기 없이 대본 본문만.\n\n" +
        `다시 확인할 원문 주제: ${topic}` +
        `\n\n${stylePriorityRule}\n\n${topicPriorityRule}`
      : "아래 대본을 같은 주제와 형식을 유지하면서 늘려 다시 쓴다.\n" +
        `분량: ${lengthGuide.prompt}. 실제 발화 시간을 우선한다.\n` +
        `독자층: ${isWebtoon ? "10~20대" : "50~60대"}. 독자층을 이유로 소재나 관계를 바꾸지 않는다.\n` +
        "반드시 유지할 것: 원문 주제의 핵심 요소, 같은 인물 관계, 같은 사건과 관점, 기존 대본의 유효한 구체 정보.\n" +
        ageRule +
        "반드시 고칠 것: 주장 나열, 추상적 비평, 뉴스 말투, 무난한 교훈, 주제 변경, 모든 문장의 같은 강도.\n" +
        "쉬운 구어체를 쓰되 짧은 말조각을 나열하지 않는다. 앞뒤 문장이 원인과 결과로 자연스럽게 이어지게 쓰고, 같은 접속어를 반복하지 않는다. " +
        "숫자와 단위는 '2,400만 원', '80만 원', '3.5배'처럼 한 덩어리로 쓰며 숫자 안의 쉼표·소수점 주변에 공백을 넣지 않는다. " +
        "의미가 끝나는 곳에만 구두점을 넣는다. 따옴표는 꼭 필요할 때 한 번만 쓴다.\n" +
        "실제 인물·브랜드·사건, 집단 공격, 허위 사실, 혐오, 범죄·자해 조장, 성적 모욕, 의료·금융 단정은 금지한다.\n" +
        "제목, 번호, 괄호, 장면 지시 없이 대본 본문만 출력한다.\n\n" +
        `원문 주제: ${topic}\n\n기존 대본:\n${previousScript}` +
        `\n\n${stylePriorityRule}\n\n${topicPriorityRule}`);

  const response = await openai.responses.create({
    model: SCRIPT_MODEL,
    input: prompt,
  });
  await recordOpenAIResponseUsage({
    userId,
    operation: mode === "first" ? "script_generate" : "script_expand",
    model: SCRIPT_MODEL,
    usage: response.usage,
    metadata: {
      language,
      targetDurationSeconds: lengthGuide.targetDurationSeconds,
      visualStyle,
      topicSource,
    },
  });

  return cleanScript(response.output_text || "");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _refineScriptIfWeak(
  openai: OpenAI,
  topic: string,
  script: string,
  selectedLength: string
) {
  const response = await openai.responses.create({
    model: SCRIPT_MODEL,
    input:
      "아래 쇼츠 대본을 검사해라. " +
      "문제가 없으면 대본 본문만 그대로 출력하고, 문제가 있으면 다시 작성해라. " +

      "다음 문제가 하나라도 있으면 반드시 다시 작성해라. " +
      "1. 자극적인 문장을 단순 나열한다. " +
      "2. 실제 생활 이슈나 현실 장면이 없다. " +
      "3. 여러 이슈를 한 대본에 섞는다. " +
      "4. 비판 대상이 중간에 바뀐다. " +
      "5. 훅, 실제 예시, 비교, 반전, 결론, 댓글 유도 구조가 약하다. " +
      "6. 마지막 질문이 본문 내용과 맞지 않는다. " +
      "7. 추상어만 많고 실제 행동이나 말투가 보이지 않는다. " +
      "8. 말투가 딱딱하거나 뉴스 해설처럼 들린다. " +
      "9. 초등학생이 바로 이해하기 어려운 단어가 많다. " +
      "10. 첫 문장의 어그로가 약하다. " +
      "11. 혐오, 허위 사실, 특정 개인 공격, 투표 관련 허위정보가 있다. " +

      `다시 작성할 경우 반드시 ${selectedLength}로 작성해라. ` +
      "실제 사람들이 바로 떠올릴 수 있는 현실 예시 하나만 사용해라. " +
      "쉬운 말, 짧은 문장, 친구한테 말하는 구어체로 써라. " +
      "첫 문장은 강하게 어그로를 끌어라. " +
      "처음에 잡은 예시와 갈등을 끝까지 유지해라. " +
      "마지막은 본문 갈등과 정확히 맞는 양자택일 질문으로 끝내라. " +
      "괄호 설명, 장면 설명, 배경음악 설명, 제목, '내레이션:' 같은 표시는 쓰지 마라. " +
      "대본 본문만 출력해라.\n\n" +

      `주제: ${topic}\n\n` +
      `대본:\n${script}`,
  });

  return cleanScript(response.output_text || script);
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
      key: `generate-script:${user.id}`,
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(req, 8 * 1024)) as {
      topic?: unknown;
      length?: unknown;
      durationSeconds?: unknown;
      language?: unknown;
      visualStyle?: unknown;
    };

    const { topic, length, durationSeconds, language, visualStyle } = body;

    if (topic !== undefined && !isStringWithinLimit(topic, 500, true)) {
      return NextResponse.json(
        { error: "주제는 500자 이하여야 합니다." },
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
    const safeVisualStyle = getSafeVideoVisualStyle(visualStyle);
    const safeDurationSeconds = getSafeDurationSeconds(durationSeconds, length);
    const lengthGuide = getLengthGuide(safeDurationSeconds, safeLanguage);

    await ensureCreditsAvailable({
      userId: user.id,
      action: "script_generate",
    });

    await recordCreditUsage({
      userId: user.id,
      action: "script_generate",
      metadata: {
        requestedTopic: typeof topic === "string" ? topic.trim() : null,
        requestedDurationSeconds: safeDurationSeconds,
        language: safeLanguage,
        chargedAtRequest: true,
      },
    });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const finalTopic =
      typeof topic === "string" && topic.trim()
        ? cleanTopic(topic.trim())
        : await generateRandomTopic(openai, safeLanguage, user.id, safeVisualStyle);
    const topicSource =
      typeof topic === "string" && topic.trim() ? "user" as const : "generated" as const;

    let finalScript = await callOpenAI(
      openai,
      finalTopic,
      lengthGuide,
      safeLanguage,
      "first",
      user.id,
      "",
      safeVisualStyle,
      topicSource
    );

    if (getComparableLength(finalScript, safeLanguage) < lengthGuide.minimumCharacters) {
      finalScript = await callOpenAI(
        openai,
        finalTopic,
        lengthGuide,
        safeLanguage,
        "expand",
        user.id,
        finalScript,
        safeVisualStyle,
        topicSource
      );
    }

    finalScript = finalScript.slice(0, SCRIPT_MAX_LENGTH).trim();

    if (!finalScript) {
      return NextResponse.json(
        { error: "대본이 비어 있습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      script: finalScript,
      topic: finalTopic,
      usedModel: SCRIPT_MODEL,
      language: safeLanguage,
      durationSeconds: safeDurationSeconds,
      length: finalScript.length,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    const creditResponse = getCreditErrorResponse(error);
    if (creditResponse) return creditResponse;

    await recordOperationFailure({
      userId,
      stage: "script_generate",
      error,
    });

    let message = "대본 생성 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
