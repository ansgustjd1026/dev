"use client";

import PageShell from "./PageShell";
import Button from "./ui/Button";
import Surface from "./ui/Surface";
import { SITE_LOCALE_COOKIE, type SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";

type Props = {
  title?: string;
  description?: string;
  error?: Error & { digest?: string };
  onRetry: () => void;
};

function getClientLocale(): SiteLocale {
  if (typeof document === "undefined") return "ko";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .some((item) => item === `${SITE_LOCALE_COOKIE}=en`)
    ? "en"
    : "ko";
}

export default function PageError({
  title,
  description,
  error,
  onRetry,
}: Props) {
  const common = getSiteText(getClientLocale()).common;

  return (
    <PageShell centered showCenterRing contentClassName="max-w-lg">
      <Surface className="p-6 text-center sm:p-8">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-400/30 bg-red-400/10 text-xl">
          !
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          {title ?? common.pageErrorTitle}
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          {description ?? common.pageErrorDescription}
        </p>

        {error?.message && (
          <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-left text-xs leading-5 text-neutral-400">
            {error.message}
          </p>
        )}

        <Button type="button" onClick={onRetry} className="mt-6">
          {common.retry}
        </Button>
      </Surface>
    </PageShell>
  );
}
