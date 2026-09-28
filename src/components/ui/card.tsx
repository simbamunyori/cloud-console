import * as React from "react";
import { cn } from "@/lib/cn";

/** A white panel on the page background. */
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface-1 shadow-elevation-1", className)} {...props}>
      {children}
    </section>
  );
}

/** A card's title row, with an optional action on the right. */
export function CardHeader({ title, description, action, id }: { title: string; description?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="text-headline text-ink">
          {title}
        </h2>
        {description ? <p className="text-callout text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

/** Label above a big number, for the Home page and summaries. */
export function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-callout text-ink-muted">{label}</span>
      <span className="text-title-1 text-ink tabular-nums">{children}</span>
      {hint ? <span className="text-callout text-ink-muted">{hint}</span> : null}
    </div>
  );
}

/**
 * Rows of label and value. On phones each row stacks, so nothing
 * scrolls sideways.
 */
export function DetailList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="flex flex-col divide-y divide-border">
      {items.map(([k, v], i) => (
        <div key={i} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="text-callout text-ink-muted">{k}</dt>
          <dd className="text-body text-ink sm:text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
