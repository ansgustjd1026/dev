import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type ButtonVariant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "app-primary border border-[#172033] bg-[#172033] text-white shadow-sm hover:bg-[#273449] disabled:hover:bg-[#172033]",
  secondary:
    "border border-slate-300 bg-white text-slate-950 shadow-sm hover:border-slate-950 hover:bg-slate-100",
  danger:
    "border border-red-200 bg-white text-red-600 shadow-sm hover:border-red-300 hover:bg-red-50",
};

export default function Button({
  variant = "primary",
  fullWidth = false,
  className,
  children,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0",
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
