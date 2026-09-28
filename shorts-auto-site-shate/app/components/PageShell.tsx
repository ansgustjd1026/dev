import { cn } from "@/lib/ui/cn";
import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  centered?: boolean;
  showCenterRing?: boolean;
};

export default function PageShell({
  children,
  className,
  contentClassName,
  contentStyle,
  centered = false,
  showCenterRing = false,
}: Props) {
  return (
    <main
      className={cn(
        "app-light relative isolate min-h-screen overflow-hidden bg-[#eef2f6] px-4 py-4 text-[#172033] sm:px-8 sm:py-6",
        centered && "flex items-center justify-center",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[linear-gradient(180deg,#ffffff,rgba(255,255,255,0))]" />
      {showCenterRing && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-slate-200" />
      )}

      <div
        className={cn("relative w-full", contentClassName)}
        style={contentStyle}
      >
        {children}
      </div>
    </main>
  );
}
