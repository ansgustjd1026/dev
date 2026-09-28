export function normalizeSpokenText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/(?<=\d)\s*,\s*(?=\d)/g, ",")
    .replace(/(?<=\d)\s*\.\s*(?=\d)/g, ".")
    .replace(/(\d[\d,]*)\s+(천|만|억|조)(?=\s*원|\b)/g, "$1$2")
    .replace(/(\d[\d,]*(?:천|만|억|조))\s*원/g, "$1 원")
    .replace(/(\d[\d,]*)\s+원/g, "$1원")
    .replace(
      /(\d[\d,.]*)\s+(개|명|번|회|배|초|분|시간|일|주|개월|년|대|퍼센트|%)/g,
      "$1$2"
    )
    .replace(/\s+([.,!?。！？…，、;:：])/g, "$1")
    .trim();
}

export function isNumericSeparator(
  text: string,
  index: number,
  separator: string
) {
  if (separator !== "," && separator !== ".") return false;

  return /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "");
}
