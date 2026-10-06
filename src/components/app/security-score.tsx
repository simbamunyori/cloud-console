import { ArrowRight, CircleCheck, ShieldAlert } from "lucide-react";
import { ConsoleLink } from "@/components/app/console-link";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { securityScore, type SecurityCheck } from "@/server/org/security-score";

/**
 * Home's security score: the number, a bar, and the checks still to do
 * with a link to each fix. `everyCheck` also lists the checks that pass,
 * as the public site's picture of the console does.
 */
export function SecurityScoreCard({ checks, everyCheck = false, demo = false, score: given, href = "/app/security" }: { checks: SecurityCheck[]; everyCheck?: boolean; demo?: boolean; score?: number; href?: string }) {
  // The full score (STRATEGY_ROLLOUT U4) comes worked out; otherwise it is the points passed.
  const score = given ?? securityScore(checks);
  const todo = checks.filter((c) => !c.passed);
  const tone = score >= 80 ? "positive" : score >= 50 ? "warning" : "negative";
  const bar = { positive: "bg-positive", warning: "bg-warning", negative: "bg-negative" }[tone];
  return (
    <Card aria-labelledby="security-score-title">
      <CardHeader
        id="security-score-title"
        title="Security score"
        action={
          <ConsoleLink demo={demo} href={href} className="text-callout text-link hover:underline">
            {href === "/app/security" ? "Security" : "Full score"}
          </ConsoleLink>
        }
      />
      <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <p className="text-display text-ink tabular-nums">
            {score}
            <span className="text-headline font-normal text-ink-muted"> / 100</span>
          </p>
          <p className="pb-1 text-callout text-ink-muted">
            {checks.length - todo.length} of {checks.length} checks passed
          </p>
        </div>
        <div role="progressbar" aria-label="Security score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${score}%` }} />
        </div>
      </div>
      {everyCheck ? (
        <ul className="divide-y divide-border border-t border-border">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 px-5 py-3 text-callout sm:px-6">
              <span className="text-ink">{c.title}</span>
              {c.passed ? (
                <span className="flex shrink-0 items-center gap-1.5 font-semibold text-positive">
                  <CircleCheck aria-hidden className="size-4" /> Done
                </span>
              ) : (
                <ConsoleLink demo={demo} href={c.fix.href} className="shrink-0 font-semibold text-link hover:underline">
                  {c.fix.label}
                </ConsoleLink>
              )}
            </li>
          ))}
        </ul>
      ) : todo.length === 0 ? (
        <div className="flex items-center gap-3 border-t border-border px-5 py-4 sm:px-6">
          <CircleCheck aria-hidden className="size-5 text-positive" />
          <p className="text-ink">Everything we check is in place.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {todo.slice(0, 3).map((c) => (
            <li key={c.key}>
              <ConsoleLink demo={demo} href={c.fix.href} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-callout font-semibold text-ink">{c.title}</span>
                  <span className="flex items-center gap-1 text-callout text-link">
                    {c.fix.label} <ArrowRight aria-hidden className="size-4" />
                  </span>
                </span>
                <span className="text-caption text-ink-muted tabular-nums">+{c.points}</span>
              </ConsoleLink>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
