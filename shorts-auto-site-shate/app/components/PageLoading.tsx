import PageShell from "./PageShell";
import Surface from "./ui/Surface";

type Props = {
  title?: string;
  description?: string;
  variant?: "list" | "profile" | "create";
};

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-slate-200 ${className}`}
      aria-hidden="true"
    />
  );
}

function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SkeletonLine className="h-4 w-2/3" />
      <SkeletonLine className="mt-4 h-3 w-full" />
      <SkeletonLine className="mt-2 h-3 w-5/6" />
      {tall && <div className="mt-5 h-44 animate-pulse rounded-xl bg-slate-200" />}
    </div>
  );
}

export default function PageLoading({
  title = "",
  description = "",
  variant = "list",
}: Props) {
  return (
    <PageShell
      className="px-5 py-6 sm:px-10 lg:px-16"
      contentClassName="mx-auto w-full max-w-[1120px]"
    >
      {(title || description) && (
        <Surface as="header" className="p-5">
          {title && (
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          )}
          {description && (
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              {description}
            </p>
          )}
        </Surface>
      )}

      <section
        className={
          variant === "profile"
            ? `${title || description ? "mt-5" : ""} grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]`
            : `${title || description ? "mt-5" : ""} grid gap-4`
        }
      >
        {variant === "create" ? (
          <>
            <SkeletonCard />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <SkeletonCard tall />
              <SkeletonCard tall />
            </div>
          </>
        ) : variant === "profile" ? (
          <>
            <SkeletonCard tall />
            <SkeletonCard tall />
          </>
        ) : (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </section>
    </PageShell>
  );
}
