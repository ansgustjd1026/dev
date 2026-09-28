export const CAPTION_EFFECT_OPTIONS = [
  {
    id: "highlight",
    label: "Highlight",
    description: "핵심 단어를 노란색으로 강조",
    previewClassName:
      "border-yellow-300/30 bg-yellow-300/10 text-yellow-100",
    sampleClassName:
      "text-yellow-200 drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]",
    sampleText: "핵심 단어",
  },
  {
    id: "impact",
    label: "Impact",
    description: "충격적인 문장을 붉은 톤으로 강조",
    previewClassName: "border-red-300/30 bg-red-300/10 text-red-100",
    sampleClassName:
      "scale-105 text-red-200 drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]",
    sampleText: "절대 금지",
  },
  {
    id: "burst",
    label: "Burst",
    description: "반전과 금액처럼 강한 핵심어에 불꽃처럼 터지는 강조",
    previewClassName:
      "border-orange-300/40 bg-orange-400/15 text-orange-50 shadow-[0_0_24px_rgba(251,146,60,0.16)]",
    sampleClassName:
      "scale-110 text-orange-200 drop-shadow-[0_3px_0_rgba(127,29,29,0.95)]",
    sampleText: "바로 여기",
  },
  {
    id: "pop",
    label: "Pop",
    description: "짧고 강한 단어를 통통 튀는 느낌으로 강조",
    previewClassName: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
    sampleClassName:
      "scale-110 text-cyan-200 drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]",
    sampleText: "바로 이거",
  },
  {
    id: "clean",
    label: "Clean",
    description: "과하지 않게 굵기와 명도만 강조",
    previewClassName: "border-white/10 bg-white/[0.06] text-neutral-100",
    sampleClassName:
      "text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.85)]",
    sampleText: "깔끔하게",
  },
] as const;

export type CaptionEffect = (typeof CAPTION_EFFECT_OPTIONS)[number]["id"];

export function getCaptionEffectOption(effect: CaptionEffect) {
  return (
    CAPTION_EFFECT_OPTIONS.find((option) => option.id === effect) ??
    CAPTION_EFFECT_OPTIONS[0]
  );
}
