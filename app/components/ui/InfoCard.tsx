import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
};

export default function InfoCard({
  label,
  value,
  meta,
  className,
  ...props
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50 p-4",
        className
      )}
      {...props}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm text-slate-900">{value}</div>
      {meta && <div className="mt-2 text-xs text-slate-500">{meta}</div>}
    </div>
  );
}
