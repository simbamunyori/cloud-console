"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { usePageToggle } from "@/lib/use-page-toggle";

/**
 * A button in the console's top bar that opens a small panel below it.
 * Closes on Escape (focus returns to the button), a click outside, or
 * when a link in it is followed.
 */
export function TopMenu({ label, icon, badge, children, className }: { label: string; icon: React.ReactNode; badge?: number; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = usePageToggle();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, setOpen]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={badge ? `${label}, ${badge} new` : label}
        onClick={() => setOpen(!open)}
        className="relative flex size-11 items-center justify-center rounded-md text-ink hover:bg-surface-2 aria-expanded:bg-surface-2"
      >
        {icon}
        {badge ? (
          <span aria-hidden className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-on-brand tabular-nums">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>
      <div
        id={panelId}
        hidden={!open}
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        className="fixed inset-x-4 top-16 z-30 overflow-hidden sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-80 rounded-lg border border-border bg-surface-1 text-ink shadow-elevation-3"
      >
        {children}
      </div>
    </div>
  );
}
