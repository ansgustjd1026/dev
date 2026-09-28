import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type Props = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "aside" | "header" | "div";
};

export default function Surface({
  as: Component = "section",
  className,
  children,
  ...props
}: Props) {
  return (
    <Component
      className={cn(
        "rounded-2xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_12px_30px_rgba(15,23,42,0.06)]",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
