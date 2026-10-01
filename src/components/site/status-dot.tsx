import { cn } from "@/lib/cn";
import type { StatusState } from "@/server/status/status";

const DOT: Record<StatusState, string> = { normal: "bg-positive", maintenance: "bg-link", degraded: "bg-warning", outage: "bg-negative" };

/** The coloured dot beside the status words; the words always say it too. */
export function StatusDot({ state, className }: { state: StatusState; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[state], className)} />;
}
