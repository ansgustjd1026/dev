"use client";

import { useRouter } from "next/navigation";
import type { SiteLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/ui/cn";

type Props = {
  locale?: SiteLocale;
  className?: string;
};

const OPTIONS: Array<{ value: SiteLocale; label: string }> = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "EN" },
];

export default function LanguageToggle({ locale, className }: Props) {
  const router = useRouter();
  const selectedLocale = locale ?? "ko";

  async function changeLocale(nextLocale: SiteLocale) {
    if (nextLocale === selectedLocale) return;

    await fetch("/api/site-locale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locale: nextLocale }),
    });
    router.refresh();
  }

  return (
    <div
      aria-label="Site language"
      className={cn(
        "inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white p-1 shadow-sm",
        className
      )}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => changeLocale(option.value)}
          className={cn(
            "h-8 rounded-md px-3 text-xs font-semibold transition",
            selectedLocale === option.value
              ? "bg-slate-950 text-slate-50 shadow-sm"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
