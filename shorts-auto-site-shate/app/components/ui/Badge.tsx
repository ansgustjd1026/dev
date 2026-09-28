import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type BadgeVariant =
  | "neutral"
  | "cyan"
  | "indigo"
  | "fuchsia"
  | "amber"
  | "emerald"
  | "danger";

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
  cyan: "border-slate-900 bg-slate-900 text-slate-50",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  fuchsia: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export default function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
