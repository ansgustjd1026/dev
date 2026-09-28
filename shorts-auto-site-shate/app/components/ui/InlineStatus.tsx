import type { ReactNode } from "react";

type StatusTone = "neutral" | "info" | "success" | "warning" | "error";

type Props = {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
  action?: ReactNode;
};

const toneClasses: Record<StatusTone, { shell: string; dot: string }> = {
  neutral: {
    shell: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
  },
  info: {
    shell: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
  },
  success: {
    shell: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  warning: {
    shell: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  error: {
    shell: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
  },
};

export default function InlineStatus({
  children,
  tone = "neutral",
  className = "",
  action,
}: Props) {
  const classes = toneClasses[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-5 ${classes.shell} ${className}`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${classes.dot}`} />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
