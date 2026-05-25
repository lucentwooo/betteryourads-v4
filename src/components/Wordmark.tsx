import { cn } from "@/lib/utils";

const sizes = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
} as const;

export function Wordmark({
  size = "md",
  className,
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span className={cn("display tracking-tight text-ink", sizes[size], className)}>
      better<span className="italic-accent">your</span>ads
    </span>
  );
}
