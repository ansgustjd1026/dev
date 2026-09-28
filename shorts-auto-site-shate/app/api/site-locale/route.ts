import { NextResponse } from "next/server";
import {
  SITE_LOCALE_COOKIE,
  getSafeSiteLocale,
} from "@/lib/i18n/config";
import {
  getRequestLimitResponse,
  readJsonBody,
} from "@/lib/security/api-limits";

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request, 1024)) as {
      locale?: unknown;
    };
    const locale = getSafeSiteLocale(body.locale);

    const response = NextResponse.json({ locale });
    response.cookies.set(SITE_LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });

    return response;
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    return NextResponse.json(
      { error: "언어 설정을 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
