import PageShell from "@/app/components/PageShell";
import LinkButton from "@/app/components/ui/LinkButton";
import Surface from "@/app/components/ui/Surface";
import { getSiteLocale } from "@/lib/i18n/server";
import { getSiteText } from "@/lib/i18n/translations";

export default async function NotFound() {
  const locale = await getSiteLocale();
  const common = getSiteText(locale).common;

  return (
    <PageShell centered showCenterRing contentClassName="max-w-lg">
      <Surface className="p-6 text-center sm:p-8">
        <div className="mx-auto inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
          404
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          {common.notFoundTitle}
        </h1>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href="/dashboard">
            {common.goDashboard}
          </LinkButton>
          <LinkButton href="/" variant="secondary">
            {common.goHome}
          </LinkButton>
        </div>
      </Surface>
    </PageShell>
  );
}
