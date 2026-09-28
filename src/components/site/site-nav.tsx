"use client";

import { Boxes, ChevronDown, Globe2, Mail, Menu, Server, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { MenuGroup } from "@/config/site";
import { cn } from "@/lib/cn";

const GROUP_ICONS: Record<MenuGroup["key"], typeof Mail> = { productivity: Mail, servers: Server, security: ShieldCheck, web: Globe2, apps: Boxes };

const link = "rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2";

/**
 * The Services mega menu on wide screens: one button, a panel of the five
 * service families. Closes on Escape (focus returns to the button), on a
 * click outside and when a link is followed.
 */
export function ServicesMenu({ base, groups }: { base: string; groups: MenuGroup[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
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
  }, [open]);

  return (
    <div ref={root}>
      <button ref={button} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className={cn(link, "flex items-center gap-1 aria-expanded:bg-surface-2")}>
        Services
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-fast motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full border-b border-border bg-surface-1 shadow-elevation-3">
        <div className="mx-auto grid max-w-content grid-cols-5 gap-6 px-6 py-8">
          {groups.map((g) => {
            const Icon = GROUP_ICONS[g.key];
            return (
              <section key={g.key} aria-labelledby={`menu-${g.key}`} className="flex flex-col gap-3">
                <span className="flex size-10 items-center justify-center rounded-md bg-brand-soft text-link">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h2 id={`menu-${g.key}`} className="text-headline text-ink">
                  {g.title}
                </h2>
                <p className="text-callout text-ink-muted">{g.blurb}</p>
                <ul className="flex flex-col gap-1">
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <Link href={`${base}${l.href}`} onClick={() => setOpen(false)} className="block rounded-sm py-1 text-callout font-medium text-link hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="border-t border-border bg-surface-0">
          <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-6 py-4 text-callout">
            <span className="text-ink-muted">Every price is per month, in your currency, on one invoice.</span>
            <Link href={`${base}/pricing`} onClick={() => setOpen(false)} className="font-semibold text-link hover:underline">
              See every price
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The whole navigation behind one button on phones, so the header stays
 * one row. A modal sheet: focus stays inside until it closes.
 */
export function SiteMenu({ base, groups, pages, footer }: { base: string; groups: MenuGroup[]; pages: { label: string; href: string }[]; footer: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

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
                const Icon = GROUP_ICONS[g.key];
                return (
                  <Link key={g.key} href={`${base}${g.links[0].href}`} onClick={() => setOpen(false)} className="flex items-start gap-3 rounded-md p-2 hover:bg-surface-2">
                    <Icon aria-hidden className="mt-1 size-5 shrink-0 text-link" />
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
