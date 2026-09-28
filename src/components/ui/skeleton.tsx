import { cn } from "@/lib/cn";

/** A grey block where content will be. It pulses gently, and holds still when the device asks for less motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none", className)} />;
}

export type LoadingLayout = "home" | "list" | "cards" | "detail" | "form";

function HeaderSkeleton() {
  return (
    <div className="mb-8 flex flex-col gap-1">
      <Skeleton className="h-9 w-56 max-w-full" />
      <Skeleton className="h-6 w-96 max-w-full" />
    </div>
  );
}

function PanelSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface-1 shadow-elevation-1", className)}>
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="flex flex-col divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-5 py-5 shadow-elevation-1 sm:px-6">
      <div className="flex flex-col gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-32" />
      </div>
    </div>
  );
}

/**
 * The shape of a page while it loads, sized like the real thing so nothing
 * jumps when it arrives. Screen readers hear "Loading" and the section.
 */
export function LoadingPage({ label, layout = "list" }: { label: string; layout?: LoadingLayout }) {
  return (
    <div role="status" aria-live="polite" data-loading>
      <span className="sr-only">Loading {label}</span>
      <HeaderSkeleton />
      {layout === "home" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-5 shadow-elevation-1">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-9 w-32" />
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <PanelSkeleton rows={4} />
            <PanelSkeleton rows={3} />
          </div>
        </div>
      ) : layout === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 shadow-elevation-1">
              <Skeleton className="size-10 rounded-md" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : layout === "detail" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)]">
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={3} />
        </div>
      ) : layout === "form" ? (
        <FormSkeleton />
      ) : (
        <PanelSkeleton rows={6} />
      )}
    </div>
  );
}
