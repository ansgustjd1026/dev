export type VideoVisualStyle =
  | "cinematic"
  | "animation_2d"
  | "monochrome_2d"
  | "animation_3d"
  | "animal_characters"
  | "webtoon";

export const VIDEO_VISUAL_STYLE_OPTIONS: Array<{
  value: VideoVisualStyle;
  ko: string;
  en: string;
}> = [
  { value: "cinematic", ko: "시네마틱 실사", en: "Cinematic" },
  { value: "animation_2d", ko: "2D 애니", en: "2D animation" },
  { value: "monochrome_2d", ko: "2D 흑백", en: "2D monochrome" },
  { value: "animation_3d", ko: "3D 애니", en: "3D animation" },
  { value: "animal_characters", ko: "동물 캐릭터", en: "Animal characters" },
  { value: "webtoon", ko: "웹툰", en: "Webtoon" },
];

export function getSafeVideoVisualStyle(value: unknown): VideoVisualStyle {
  return value === "animation_2d" ||
    value === "monochrome_2d" ||
    value === "animation_3d" ||
    value === "animal_characters" ||
    value === "webtoon"
    ? value
    : "cinematic";
}

export function getVideoVisualStylePrompt(style: VideoVisualStyle) {
  const prompts: Record<VideoVisualStyle, string> = {
    cinematic:
      "STYLE LOCK: cinematic live-action still photography. Use believable human anatomy, natural skin texture, real fabric and locations, restrained film color grading, shallow depth of field, and one consistent 35mm camera language. Never use illustration, anime, webtoon line art, painterly rendering, plastic 3D characters, or game graphics",
    animation_2d:
      "STYLE LOCK: polished full-color hand-drawn 2D animation. Use clean dark outlines of one consistent thickness, flat cel colors, two-step cel shading, simplified backgrounds, expressive faces, and consistent character proportions. Never use photorealism, 3D rendering, clay, watercolor, monochrome manga, or live-action textures",
    monochrome_2d:
      "STYLE LOCK: hand-drawn black-and-white 2D ink animation. Use only black, white, and neutral gray; bold uniform ink contours, hard-edged shadow shapes, sparse cross-hatching, white paper texture, and consistent character proportions. Absolutely no color, photorealistic skin, 3D rendering, glossy materials, or full-color webtoon styling",
    animation_3d:
      "STYLE LOCK: stylized cinematic 3D animated-film frame. Use the same rounded character proportions, sculpted hair shapes, clean detailed materials, soft global illumination, subtle subsurface skin, and cinematic depth of field in every scene. Never use live-action photography, 2D outlines, anime cel art, monochrome ink, or low-poly game graphics",
    animal_characters:
      "STYLE LOCK: polished animated-film world populated only by appealing anthropomorphic animal characters. Replace every human role with a consistent animal species and preserve its fur color, markings, clothing, body proportions, and facial design in every scene. Use expressive faces and soft cinematic 3D lighting. Never show humans, realistic wildlife photography, mascot costumes, 2D manga, or mixed visual media",
    webtoon:
      "STYLE LOCK: a finished modern Korean full-color vertical webtoon panel, drawn entirely as 2D illustration. Use confident dark contour lines with consistent line weight, clean facial linework, simplified but anatomically coherent features, flat base colors, deliberate two-step cel shading, subtle gradient lighting, and polished serialized-webtoon rendering. Stage the scene as one full-bleed vertical panel with a clear foreground character, readable emotional acting, purposeful negative space, and a simplified contemporary Korean background. Keep recurring characters' face shape, hairstyle, clothing, body proportions, and palette identical between panels. Do not include panel borders, speech bubbles, captions, or written sound effects. Absolutely no photography, photorealistic skin or fabric, 3D render, anime screenshot, rough storyboard, sketch, watercolor, black-and-white manga, western superhero anatomy, comic halftones, collage, or mixed media",
  };

  return prompts[style];
}
