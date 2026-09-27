import type { LucideIcon } from "lucide-react";
import * as React from "react";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border-strong/60 bg-surface-1 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-link">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="text-headline text-ink">{title}</h2>
        {children ? <p className="text-body text-ink-muted">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}
