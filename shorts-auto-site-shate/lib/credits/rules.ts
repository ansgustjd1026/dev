export type CreditAction =
  | "script_generate"
  | "tts_generate"
  | "transcribe_audio"
  | "render_video"
  | "render_image_video";

export const MONTHLY_CREDIT_LIMIT = 10;

export const CREDIT_RULES: Record<CreditAction, number> = {
  script_generate: 1,
  tts_generate: 1,
  transcribe_audio: 1,
  render_video: 2,
  render_image_video: 50,
};

export const CREDIT_ACTION_LABELS: Record<CreditAction, string> = {
  script_generate: "대본 생성",
  tts_generate: "음성 생성",
  transcribe_audio: "자막 싱크 분석",
  render_video: "최종 쇼츠 합성",
  render_image_video: "자동 생성 쇼츠",
};

export function getCreditCost(action: CreditAction) {
  return CREDIT_RULES[action];
}
