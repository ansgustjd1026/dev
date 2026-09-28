import { cookies } from "next/headers";
import {
  SITE_LOCALE_COOKIE,
  getSafeSiteLocale,
  type SiteLocale,
} from "./config";

export async function getSiteLocale(): Promise<SiteLocale> {
  const cookieStore = await cookies();
  return getSafeSiteLocale(cookieStore.get(SITE_LOCALE_COOKIE)?.value);
}
