"use client";

import { Link2 } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { shareReportAction } from "./actions";

/** "Share this report" under the email check (U9): a link, only once the visitor ticks to agree. */
export function ShareReportForm({ market, domain, consent }: { market: string; domain: string; consent: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(shareReportAction, {});
  const [copied, setCopied] = useState(false);
  const id = useId();
  if (state.ok && state.message) {
    // Only shown after the form was sent, so always in the browser.
    const url = `${window.location.origin}${state.message}`;
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6">
        <p className="flex items-center gap-2 text-headline text-ink">
          <Link2 aria-hidden className="size-5 text-link" /> Your link is ready
        </p>
        <p className="text-callout text-ink-muted">Anyone with it can see this report for 90 days.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input readOnly value={url} aria-label="Link to this report" className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-0 px-3 text-callout text-ink" onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} noValidate aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="domain" value={domain} />
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-headline text-ink">
          Share this report
        </h2>
        <p className="text-callout text-ink-muted">Send it to a colleague or whoever looks after your IT, without them running the check again.</p>
      </div>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2.5 text-callout text-ink-body">
          <input type="checkbox" name="consent" value="yes" className="mt-0.5 size-4 shrink-0 accent-brand" aria-invalid={Boolean(state.fieldErrors?.consent) || undefined} />
          <span>{consent}</span>
        </label>
        {state.fieldErrors?.consent ? <p className="text-callout text-negative">{state.fieldErrors.consent}</p> : null}
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Making the link…" : "Make a link"}
        </Button>
      </div>
    </form>
  );
}
