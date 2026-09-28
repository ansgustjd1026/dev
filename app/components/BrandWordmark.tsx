import Image from "next/image";
import { cn } from "@/lib/ui/cn";

type Props = {
  className?: string;
  size?: "sm" | "md" | "header" | "lg";
};

const sizes = {
  sm: {
    icon: "h-8 w-8 rounded-lg",
    label: "text-xl",
  },
  md: {
    icon: "h-10 w-10 rounded-xl",
    label: "text-2xl",
  },
  header: {
    icon: "h-11 w-11 rounded-xl sm:h-12 sm:w-12",
    label: "text-[28px] sm:text-[32px]",
  },
  lg: {
    icon: "h-16 w-16 rounded-2xl sm:h-18 sm:w-18",
    label: "text-4xl sm:text-5xl",
  },
} as const;

export default function BrandWordmark({ className, size = "md" }: Props) {
  const styles = sizes[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="Shate">
      <span className={cn("relative shrink-0 overflow-hidden shadow-sm", styles.icon)}>
        <Image
          src="/shate-toss-icon-light.png"
          alt=""
          fill
          priority
          sizes="72px"
          className="brand-icon-light object-cover"
        />
        <Image
          src="/shate-toss-icon-dark.png"
          alt=""
          fill
          priority
          sizes="72px"
          className="brand-icon-dark object-cover"
        />
      </span>
      <span className={cn("font-extrabold leading-none text-slate-950", styles.label)}>
        Shate
      </span>
    </span>
  );
}
