"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { usePageToggle } from "@/lib/use-page-toggle";
import type { FrameLink, MenuView } from "./frame-content";

type Menus = Pick<MenuView, "id" | "label" | "columns">[];

/** A menu's link columns: each link with its one-line description. */
function Columns({ menu, onFollow, where }: { menu: Menus[number]; onFollow: () => void; where: "wide" | "phone" }) {
  return (
    <>
      {menu.columns.map((c, i) => (
        <section key={i} aria-labelledby={c.heading ? `${where}-${menu.id}-col-${i}` : undefined} className="flex min-w-0 flex-col gap-4">
          {c.heading ? (
            <h2 id={`${where}-${menu.id}-col-${i}`} className="text-caption font-semibold tracking-widest text-ink-muted uppercase">
              {c.heading}
            </h2>
          ) : null}
          <ul className="flex flex-col gap-4">
            {c.links.map((l) => (
              <li key={l.label}>
                <Link href={l.href} onClick={onFollow} className="group flex flex-col gap-0.5 rounded-sm">
                  <span className="text-callout font-semibold text-ink group-hover:text-link">{l.label}</span>
                  {l.description ? <span className="text-callout text-ink-muted">{l.description}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * The header's menus on wide screens. Each opens a full-width panel on
 * hover, on click, and when its button gets keyboard focus; Escape closes
 * it and returns focus to the button, as do a click outside and following
 * a link. `features` is each menu's feature area, drawn on the server.
 */
export function MegaMenus({ menus, features, className }: { menus: Menus; features: Record<string, React.ReactNode>; className?: string }) {
  const [openId, setOpenId] = useOpenMenu();
  const root = useRef<HTMLDivElement>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const open = useCallback(
    (id: string) => {
      clearTimeout(leave.current);
      setOpenId(id);
    },
    [setOpenId],
  );
  const closeSoon = () => {
    clearTimeout(leave.current);
    leave.current = setTimeout(() => setOpenId(null), 150);
  };

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      document.getElementById(`${openId}-button`)?.focus({ preventScroll: true });
      setOpenId(null);
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [openId, setOpenId]);

  return (
    <div ref={root} className={cn("flex items-center gap-6.5", className)}>
      {menus.map((m) => {
        const isOpen = openId === m.id;
        return (
          <div
            key={m.id}
            onMouseEnter={() => open(m.id)}
            onMouseLeave={closeSoon}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenId(null);
            }}
          >
            <button
              id={`${m.id}-button`}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${m.id}-panel`}
              onClick={() => setOpenId(isOpen ? null : m.id)}
              onFocus={(e) => {
                // Keyboard focus opens the menu; a mouse press is handled by the click.
                if (e.currentTarget.matches(":focus-visible")) open(m.id);
              }}
              className="flex h-19 items-center gap-1 text-site-nav text-ink hover:text-link aria-expanded:text-link"
            >
              {m.label}
              <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-fast motion-reduce:transition-none", isOpen && "rotate-180")} />
            </button>
            <div id={`${m.id}-panel`} hidden={!isOpen} className="absolute inset-x-0 top-full z-40 border-y border-border bg-surface-1 shadow-elevation-3">
              <div className="page-container grid grid-cols-[1fr_var(--layout-aside-wide)] gap-12 py-10">
                <div className={cn("grid gap-10", m.columns.length === 1 ? "grid-cols-1" : m.columns.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                  <Columns menu={m} onFollow={() => setOpenId(null)} where="wide" />
                </div>
                <div onClickCapture={(e) => (e.target as HTMLElement).closest("a") && setOpenId(null)}>{features[m.id]}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One menu open at a time, closed again when the page changes. */
function useOpenMenu(): [string | null, (id: string | null) => void] {
  const pathname = usePathname();
  const [state, setState] = useState<{ id: string; on: string } | null>(null);
  const set = useCallback((id: string | null) => setState(id ? { id, on: pathname } : null), [pathname]);
  return [state && state.on === pathname ? state.id : null, set];
}

/**
 * Everything behind one button on phones: each menu as an expandable
 * list, then the plain links. A modal sheet: focus stays inside until it
 * closes.
 */
export function PhoneMenu({ menus, links, footer }: { menus: Menus; links: FrameLink[]; footer: React.ReactNode }) {
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
      <button type="button" onClick={() => setOpen(true)} className="flex size-10.5 items-center justify-center rounded-lg border border-border text-ink hover:bg-surface-2" aria-label="Open menu" aria-haspopup="dialog">
        <Menu aria-hidden className="size-5" />
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
          <nav aria-label="Site" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
            {menus.map((m) => (
              <details key={m.id} className="group border-t border-border">
                <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between text-body font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {m.label}
                  <ChevronDown aria-hidden className="size-4 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <div className="flex flex-col gap-5 pb-5">
                  <Columns menu={m} onFollow={() => setOpen(false)} where="phone" />
                </div>
              </details>
            ))}
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-13 items-center border-t border-border text-body font-semibold text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          {/* Pinned below the scrolling links, so "Get started" is always in view. */}
          <div className="flex flex-col gap-3 border-t border-border p-4">{footer}</div>
        </div>
      </dialog>
    </>
  );
}
