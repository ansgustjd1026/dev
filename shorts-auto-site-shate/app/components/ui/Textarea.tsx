import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function Textarea({ className, ...props }: Props) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-5 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10",
        className
      )}
      {...props}
    />
  );
}
