"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { usePageToggle } from "@/lib/use-page-toggle";
import type { FrameLink, MenuGroupView } from "./frame-content";
import { BlockIcon } from "./icons";

const link = "rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2";

/**
 * The Services mega menu on wide screens: one button, a panel of the five
 * service families. Closes on Escape (focus returns to the button), on a
 * click outside and when a link is followed.
 */
export function ServicesMenu({ groups, note, more }: { groups: MenuGroupView[]; note: string | null; more: FrameLink | null }) {
  const [open, setOpen] = usePageToggle();
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
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
    <div ref={root}>
      <button ref={button} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className={cn(link, "flex items-center gap-1 aria-expanded:bg-surface-2")}>
        Services
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-fast motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full border-b border-border bg-surface-1 shadow-elevation-3">
        <div className="page-container grid grid-cols-5 gap-6 py-8">
          {groups.map((g) => {
            return (
              <section key={g.id} aria-labelledby={`menu-${g.id}`} className="flex flex-col gap-3">
                <span className="flex size-10 items-center justify-center rounded-md bg-brand-soft text-link">
                  <BlockIcon name={g.icon} className="size-5" />
                </span>
                <h2 id={`menu-${g.id}`} className="text-headline text-ink">
                  {g.title}
                </h2>
                <p className="text-callout text-ink-muted">{g.blurb}</p>
                {g.from ? <p className="text-callout font-semibold text-ink">{g.from}</p> : null}
                <ul className="flex flex-col gap-1">
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-sm py-1 text-callout font-medium text-link hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        {note || more ? (
          <div className="border-t border-border bg-surface-0">
            <div className="page-container flex items-center justify-between gap-4 py-4 text-callout">
              <span className="text-ink-muted">{note}</span>
              {more ? (
                <Link href={more.href} onClick={() => setOpen(false)} className="font-semibold text-link hover:underline">
                  {more.label}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The whole navigation behind one button on phones, so the header stays
 * one row. A modal sheet: focus stays inside until it closes.
 */
export function SiteMenu({ groups, pages, footer }: { groups: MenuGroupView[]; pages: FrameLink[]; footer: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = usePageToggle();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex size-11 items-center justify-center rounded-md text-ink hover:bg-surface-2" aria-label="Open menu" aria-haspopup="dialog">
        <Menu aria-hidden className="size-6" />
      </button>
      <dialog
        ref={ref}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-0 ml-auto h-dvh max-h-none w-drawer bg-surface-1 p-0 text-ink backdrop:bg-scrim"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-4">
            <span className="text-headline">Menu</span>
            <button type="button" onClick={() => setOpen(false)} className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2" aria-label="Close menu">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <nav aria-label="Site" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
            <div className="flex flex-col gap-4">
              <h2 className="label-kicker text-ink-muted">Services</h2>
              {groups.map((g) => {
                return (
                  <Link key={g.id} href={g.links[0].href} onClick={() => setOpen(false)} className="flex items-start gap-3 rounded-md p-2 hover:bg-surface-2">
                    <BlockIcon name={g.icon} className="mt-1 size-5 shrink-0 text-link" />
                    <span className="flex flex-col">
                      <span className="text-body font-semibold text-ink">{g.title}</span>
                      <span className="text-callout text-ink-muted">{g.blurb}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              {pages.map((p) => (
                <Link key={p.href} href={p.href} onClick={() => setOpen(false)} className={cn(link, "min-h-11 content-center text-body")}>
                  {p.label}
                </Link>
              ))}
            </div>
          </nav>
          {/* Pinned below the scrolling links, so "Get started" is always in view. */}
          <div className="flex flex-col gap-3 border-t border-border p-4">{footer}</div>
        </div>
      </dialog>
    </>
  );
}
