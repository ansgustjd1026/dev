import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

type LinkButtonVariant = "primary" | "secondary";

type Props = ComponentProps<typeof Link> & {
  variant?: LinkButtonVariant;
};

const VARIANT_CLASSES: Record<LinkButtonVariant, string> = {
  primary:
    "app-primary border border-[#172033] bg-[#172033] text-white shadow-sm hover:bg-[#273449]",
  secondary:
    "border border-slate-300 bg-white text-slate-950 shadow-sm hover:border-slate-950 hover:bg-slate-100",
};

export default function LinkButton({
  variant = "primary",
  className,
  children,
  ...props
}: Props) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
