import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type Props = InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10",
        className
      )}
      {...props}
    />
  );
}
