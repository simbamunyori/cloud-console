import { cn } from "@/lib/cn";

const TONES = {
  neutral: "bg-surface-2 text-ink-muted",
  info: "bg-brand-soft text-link",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  negative: "bg-negative-soft text-negative",
} as const;

export type BadgeTone = keyof typeof TONES;

/** Status in words, with colour as a second signal. */
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2 text-caption font-semibold whitespace-nowrap", TONES[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
