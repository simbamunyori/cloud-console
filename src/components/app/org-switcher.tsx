"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { switchOrganisationAction } from "@/app/(frontend)/app/actions";
import { cn } from "@/lib/cn";

export interface OrgOption {
  id: string;
  name: string;
  role: string;
}

function orgInitials(name: string): string {
  return name
    .replace(/&/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Badge({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-sm bg-navy font-bold text-on-navy", small ? "size-7 text-caption" : "size-9 text-caption")}
    >
      {orgInitials(name)}
    </span>
  );
}

/**
 * The organisation card at the top of the menu. When someone belongs to
 * more than one organisation, it opens a list to switch between them.
 */
export function OrgSwitcher({ current, options, up }: { current: OrgOption; options: OrgOption[]; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const others = options.filter((o) => o.id !== current.id);
  const card = (
    <>
      <Badge name={current.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-callout font-semibold text-ink">{current.name}</span>
        <span className="text-caption text-ink-muted">{current.role}</span>
      </span>
    </>
  );
  if (others.length === 0) {
    return <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-1 p-3">{card}</div>;
  }
  const item = "flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${current.name}. Switch organisation`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2"
      >
        {card}
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </button>
      {open ? (
        <div
          id={menuId}
          className={cn(
            "absolute inset-x-0 z-30 flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-1.5 shadow-elevation-2",
            up ? "bottom-full mb-2" : "mt-2",
          )}
        >
          <div className={cn(item, "hover:bg-transparent")} aria-current="true">
            <Badge name={current.name} small />
            <span className="line-clamp-2 flex-1 text-callout font-semibold text-ink">{current.name}</span>
            <Check aria-label="Open now" className="size-4 shrink-0 text-link" />
          </div>
          {others.map((o) => (
            <form key={o.id} action={switchOrganisationAction}>
              <input type="hidden" name="organisationId" value={o.id} />
              <button type="submit" className={item}>
                <Badge name={o.name} small />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-2 text-callout font-semibold text-ink">{o.name}</span>
                  <span className="truncate text-caption text-ink-muted">{o.role}</span>
                </span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
