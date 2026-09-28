"use client";

import "./globals.css";
import Button from "@/app/components/ui/Button";
import { SITE_LOCALE_COOKIE, type SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";

function getClientLocale(): SiteLocale {
  if (typeof document === "undefined") return "ko";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .some((item) => item === `${SITE_LOCALE_COOKIE}=en`)
    ? "en"
    : "ko";
}

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const locale = getClientLocale();
  const common = getSiteText(locale).common;

  return (
    <html lang={locale}>
      <body>
        <main className="app-light relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f7fa] px-5 py-8 text-slate-900">
          <title>{common.appErrorTitle} - Shate</title>

          <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-red-200 bg-red-50 text-xl text-red-700">
              !
            </div>

            <h1 className="mt-6 text-3xl font-semibold tracking-tight">
              {common.appErrorTitle}
            </h1>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              {common.appErrorDescription}
            </p>

            {error?.message && (
              <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs leading-5 text-slate-600">
                {error.message}
              </p>
            )}

            <Button type="button" onClick={unstable_retry} className="mt-6">
              {common.retry}
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}
