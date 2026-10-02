"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useSyncExternalStore } from "react";

/**
 * Thapelo, the website's AI sales assistant (docs/design/home-desktop.html
 * and home-phone.html): an open panel on desktop, a bubble on phones.
 * Minimising is remembered on this device. Anyone can reach a person from
 * it in one tap: "Talk to a person" opens the contact form.
 */

// The panel's code loads only when it opens, so phones get just the bubble.
const ThapeloPanel = dynamic(() => import("./thapelo-panel"), { ssr: false });

const KEY = "thapelo";
const CHANGED = "thapelo-change";

function subscribeStored(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener(CHANGED, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(CHANGED, fn);
  };
}
function readStored(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function store(value: "open" | "closed") {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Private windows can refuse storage; the panel still works for this page.
  }
  window.dispatchEvent(new Event(CHANGED));
}

const WIDE = "(min-width: 1024px)";
function subscribeWide(fn: () => void) {
  const q = window.matchMedia(WIDE);
  q.addEventListener("change", fn);
  return () => q.removeEventListener("change", fn);
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function Thapelo({
  market,
  greeting,
  quickReplies,
  consentText,
  privacyHref,
  bookingHref,
}: {
  market: string;
  greeting: string;
  quickReplies: string[];
  consentText: string;
  privacyHref: string;
  /** The pre-sales booking page, while it takes bookings. */
  bookingHref: string | null;
}) {
  const stored = useSyncExternalStore(subscribeStored, readStored, () => "server");
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const open = stored === "open" || (stored === null && wide);
  const id = useId();

  // "Talk to Thapelo" links elsewhere on the site point at #thapelo.
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#thapelo") store("open");
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-end gap-3.5 lg:inset-x-auto lg:right-8 lg:bottom-6">
      {open ? (
        <ThapeloPanel
          id={id}
          market={market}
          greeting={greeting}
          quickReplies={quickReplies}
          consentText={consentText}
          privacyHref={privacyHref}
          bookingHref={bookingHref}
          onClose={() => store("closed")}
        />
      ) : null}
      <div className="flex items-center gap-2.5">
        {open ? null : <span className="pointer-events-auto rounded-lg bg-navy px-3 py-2 text-caption text-on-navy lg:hidden">Questions? Ask Thapelo</span>}
        <button
          type="button"
          aria-label="Chat with Thapelo"
          aria-expanded={open}
          onClick={() => store(open ? "closed" : "open")}
          className="pointer-events-auto flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand shadow-elevation-3 hover:bg-brand-hover lg:size-15"
        >
          <ChatIcon className="size-6.5" />
        </button>
      </div>
    </div>
  );
}
