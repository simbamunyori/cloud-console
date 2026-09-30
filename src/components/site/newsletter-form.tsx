"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { subscribeAction } from "@/app/(frontend)/[market]/newsletter/actions";
import type { ActionState } from "@/server/action-state";

/** The footer's newsletter sign-up: an address and a consent tick, then a confirmation email (double opt-in). */
export function NewsletterForm({ market, privacyHref }: { market: string; privacyHref: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(subscribeAction, {});
  const id = useId();
  if (state.ok) {
    return (
      <p role="status" className="text-body text-on-navy">
        {state.message} The link in the email finishes your sign-up.
      </p>
    );
  }
  const error = state.fieldErrors?.email ?? state.fieldErrors?.consent ?? state.error;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="market" value={market} />
      {/* People never see this field; bots fill it in. */}
      <div aria-hidden className="hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Your work email"
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12.5 min-w-0 shrink-0 sm:flex-1 rounded-sm border border-footer-field-line bg-footer-field px-4 text-body text-on-navy placeholder:text-footer-muted"
        />
        <button type="submit" disabled={pending} className="h-12.5 rounded-sm bg-brand px-5.5 text-body font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-70">
          Subscribe
        </button>
      </div>
      <label className="flex items-start gap-2.5 text-caption text-footer-muted">
        <input type="checkbox" name="consent" value="yes" required className="mt-0.5 size-4 shrink-0 accent-brand" aria-invalid={Boolean(state.fieldErrors?.consent) || undefined} />
        <span>
          Send me the monthly insights email. I can unsubscribe at any time. See our{" "}
          <Link href={privacyHref} className="text-footer-link underline underline-offset-2 hover:text-on-navy">
            Privacy notice
          </Link>
          .
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-callout text-on-navy">
          {error}
        </p>
      ) : null}
    </form>
  );
}
