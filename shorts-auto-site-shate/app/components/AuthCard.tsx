import type { SiteLocale } from "@/lib/i18n/config";
import Link from "next/link";
import BrandWordmark from "./BrandWordmark";
import LanguageToggle from "./LanguageToggle";
import PageShell from "./PageShell";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  locale?: SiteLocale;
  children: React.ReactNode;
};

export default function AuthCard({
  eyebrow = "Shate",
  title,
  description,
  locale,
  children,
}: Props) {
  return (
    <PageShell
      centered
      showCenterRing
      className="py-8"
      contentClassName="max-w-md"
    >
      <section className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/50"
            aria-label={eyebrow}
          >
            <BrandWordmark size="sm" />
          </Link>
          <LanguageToggle locale={locale} />
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description && (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {description}
          </p>
        )}

        <div className={description ? "mt-7" : "mt-6"}>{children}</div>
      </section>
    </PageShell>
  );
}
