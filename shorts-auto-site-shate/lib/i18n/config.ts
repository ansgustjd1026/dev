export type SiteLocale = "ko" | "en";

export const SITE_LOCALE_COOKIE = "site_locale";
export const SITE_LOCALES: SiteLocale[] = ["ko", "en"];

export function isSiteLocale(value: unknown): value is SiteLocale {
  return value === "ko" || value === "en";
}

export function getSafeSiteLocale(value: unknown): SiteLocale {
  return isSiteLocale(value) ? value : "ko";
}
