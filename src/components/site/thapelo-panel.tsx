"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { askThapeloAction, thapeloContactAction, thapeloHistoryAction, type ContactState } from "@/app/(frontend)/[market]/thapelo-actions";
import type { SalesCard } from "@/server/sales/assistant";

/** Thapelo's open panel: the chat, quick replies and Talk to a person. Loaded only once the panel opens. */

interface Line {
  from: "visitor" | "thapelo";
  text: string;
  cards?: SalesCard[];
}

export default function ThapeloPanel({
  id,
  market,
  greeting,
  quickReplies,
  consentText,
  privacyHref,
  bookingHref,
  onClose,
}: {
  id: string;
  market: string;
  greeting: string;
  quickReplies: string[];
  consentText: string;
  privacyHref: string;
  bookingHref: string | null;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [contact, setContact] = useState<{ reason: "person" | "follow-up"; need: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // The chat so far, when the visitor comes back or moves to another page.
  useEffect(() => {
    let live = true;
    thapeloHistoryAction(market)
      .then((h) => {
        if (!live) return;
        if (h) setLines((now) => (now.length ? now : h.messages));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [market]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines, pending, contact]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setError(null);
    setQuestion("");
    setLines((now) => [...now, { from: "visitor", text: q }]);
    setPending(true);
    try {
      const reply = await askThapeloAction(market, q, window.location.pathname);
      if (reply.error) setError(reply.error);
      else setLines((now) => [...now, { from: "thapelo", text: reply.answer ?? "", cards: reply.cards }]);
    } catch {
      setError("Thapelo couldn't answer just now. Try again, or talk to a person.");
    } finally {
      setPending(false);
      input.current?.focus();
    }
  }

  const last = lines.at(-1);
  return (
    <aside
      id={`${id}-panel`}
      aria-label="Thapelo, your AI assistant"
      className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-site-frame bg-surface-0 shadow-elevation-3 lg:w-92"
    >
      <div className="flex h-14 shrink-0 items-center gap-3 bg-navy px-4 text-on-navy">
        <img src="/brand/logo/fgt-logo-reverse.svg" alt="" width={92} height={24} className="h-6 w-auto" />
        <div className="flex flex-col">
          <span className="text-callout font-semibold">Thapelo</span>
          <span className="text-site-strip text-assistant-online">
            <span aria-hidden>● </span>Your AI assistant · online now
          </span>
        </div>
        <button type="button" aria-label="Minimise Thapelo" onClick={onClose} className="ml-auto flex size-8 items-center justify-center rounded-lg hover:bg-navy-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="size-4.5">
            <path d="M6 12h12" />
          </svg>
        </button>
      </div>

      <div ref={log} className="flex max-h-96 flex-col gap-3 overflow-y-auto bg-surface-2 p-4">
        <div role="log" aria-live="polite" aria-label="Conversation with Thapelo" className="flex flex-col gap-3">
          <p className="max-w-72.5 self-start rounded-lg border border-border bg-surface-0 px-3.5 py-3 text-callout text-ink">{greeting}</p>
          {lines.map((l, i) =>
            l.from === "visitor" ? (
              <p key={i} className="max-w-62.5 self-end rounded-lg bg-brand px-3.5 py-2.5 text-callout whitespace-pre-line text-on-brand">
                <span className="sr-only">You: </span>
                {l.text}
              </p>
            ) : (
              <div key={i} className="flex max-w-72.5 flex-col gap-2 self-start">
                <p className="rounded-lg border border-border bg-surface-0 px-3.5 py-3 text-callout whitespace-pre-line text-ink">
                  <span className="sr-only">Thapelo: </span>
                  {l.text}
                </p>
                {l.cards?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {l.cards.map((c, j) =>
                      c.kind === "link" ? (
                        <Link key={j} href={c.href} className="rounded-sm bg-brand px-2.5 py-1.75 text-caption font-semibold text-on-brand hover:bg-brand-hover">
                          {c.label}
                        </Link>
                      ) : (
                        <button
                          key={j}
                          type="button"
                          onClick={() => setContact({ reason: c.reason, need: c.need })}
                          className="rounded-sm bg-brand px-2.5 py-1.75 text-caption font-semibold text-on-brand hover:bg-brand-hover"
                        >
                          Leave your details
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ),
          )}
          {pending ? (
            <p className="self-start rounded-lg border border-border bg-surface-0 px-3.5 py-3 text-callout text-ink-muted">
              Thapelo is looking that up<span aria-hidden>...</span>
            </p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-caption text-negative">
            {error}
          </p>
        ) : null}
        {contact ? (
          <ContactForm market={market} reason={contact.reason} need={contact.need} consentText={consentText} privacyHref={privacyHref} onClose={() => setContact(null)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(last?.from === "thapelo" ? [] : quickReplies).map((r) => (
              <button
                key={r}
                type="button"
                disabled={pending}
                onClick={() => ask(r)}
                className="rounded-sm border border-border-strong bg-surface-0 px-2.5 py-1.75 text-caption text-link hover:bg-brand-soft"
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setContact({ reason: "person", need: lines.find((l) => l.from === "visitor")?.text ?? "" })}
              className="rounded-sm border border-border-strong bg-surface-0 px-2.5 py-1.75 text-caption text-link hover:bg-brand-soft"
            >
              Talk to a person
            </button>
            {bookingHref ? (
              <a href={bookingHref} className="rounded-sm border border-border-strong bg-surface-0 px-2.5 py-1.75 text-caption text-link hover:bg-brand-soft">
                Book a call with an engineer
              </a>
            ) : null}
          </div>
        )}
      </div>

      <form
        className="flex shrink-0 gap-2 border-t border-border bg-surface-0 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Ask a question
        </label>
        <input
          ref={input}
          id={`${id}-q`}
          type="text"
          value={question}
          maxLength={1000}
          autoComplete="off"
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Thapelo about domains, email or plans"
          className="h-10.5 min-w-0 flex-1 rounded-sm border border-border-strong bg-surface-0 px-3 text-callout text-ink placeholder:text-ink-muted"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={pending}
          className="flex size-10.5 shrink-0 items-center justify-center rounded-sm bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-70"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </aside>
  );
}

/** Talk to a person: the visitor's details, with consent, in a form (never in the chat). */
function ContactForm({
  market,
  reason,
  need,
  consentText,
  privacyHref,
  onClose,
}: {
  market: string;
  reason: "person" | "follow-up";
  need: string;
  consentText: string;
  privacyHref: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<ContactState, FormData>(thapeloContactAction, {});
  const id = useId();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  if (state.reference) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-3.5 text-callout text-ink">
        <p className="font-semibold">Thank you. Someone from our team will contact you.</p>
        {state.reference !== "received" ? <p className="text-caption text-ink-muted">Your reference is {state.reference}. We sent a copy to your email.</p> : null}
        <button type="button" onClick={onClose} className="self-start text-caption text-link underline underline-offset-2">
          Back to the chat
        </button>
      </div>
    );
  }

  const f = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const field = "h-10 rounded-sm border border-border-strong bg-surface-0 px-3 text-callout text-ink";
  const err = (k: string) =>
    f[k] ? (
      <span id={`${id}-${k}-e`} className="text-caption text-negative">
        {f[k]}
      </span>
    ) : null;
  const aria = (k: string) => ({ "aria-invalid": Boolean(f[k]) || undefined, "aria-describedby": f[k] ? `${id}-${k}-e` : undefined });
  return (
    <form action={action} noValidate aria-label={reason === "person" ? "Talk to a person" : "Leave your details"} className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-0 p-3.5">
      <p className="text-callout font-semibold text-ink">{reason === "person" ? "Talk to a person" : "Leave your details"}</p>
      <p className="text-caption text-ink-muted">We&apos;ll get back to you by email or phone, with this conversation in hand.</p>
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="reason" value={reason} />
      <div aria-hidden className="hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex flex-col gap-1 text-caption text-ink">
        Name
        <input ref={first} name="name" defaultValue={v.name} autoComplete="name" required className={field} {...aria("name")} />
        {err("name")}
      </label>
      <label className="flex flex-col gap-1 text-caption text-ink">
        Email
        <input name="email" defaultValue={v.email} type="email" autoComplete="email" required className={field} {...aria("email")} />
        {err("email")}
      </label>
      <label className="flex flex-col gap-1 text-caption text-ink">
        Phone (optional)
        <input name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-caption text-ink">
        Company (optional)
        <input name="company" defaultValue={v.company} autoComplete="organization" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-caption text-ink">
        What do you need?
        <textarea
          name="need"
          rows={3}
          required
          defaultValue={v.need ?? need}
          maxLength={2000}
          className="rounded-sm border border-border-strong bg-surface-0 px-3 py-2 text-callout text-ink"
          {...aria("need")}
        />
        {err("need")}
      </label>
      <label className="flex items-start gap-2 text-caption text-ink-body">
        <input type="checkbox" name="consent" value="yes" required className="mt-0.5 size-4 shrink-0 accent-brand" {...aria("consent")} />
        <span>
          {consentText}{" "}
          <Link href={privacyHref} className="text-link underline underline-offset-2">
            Read the Privacy Notice
          </Link>
        </span>
      </label>
      {err("consent")}
      {state.error ? (
        <p role="alert" className="text-caption text-negative">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-10 rounded-sm bg-brand px-4 text-callout font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-70">
          Send to our team
        </button>
        <button type="button" onClick={onClose} className="text-caption text-link underline underline-offset-2">
          Back to the chat
        </button>
      </div>
    </form>
  );
}
