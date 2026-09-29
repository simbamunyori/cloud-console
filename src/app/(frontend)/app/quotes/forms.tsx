"use client";

import { useActionState, useState } from "react";
import { StartNowField } from "@/app/(frontend)/app/marketplace/start-now";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { acceptQuoteAction, declineQuoteAction } from "./actions";

export function AcceptQuoteForm({ reference, total, refundsHref }: { reference: string; total: string; refundsHref: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptQuoteAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="reference" value={reference} />
      <p className="text-headline text-ink">{total}</p>
      <p className="text-callout text-ink-muted">Accepting places the order at these prices. The first month and anything charged once are invoiced now, and you can pay by card or bank transfer.</p>
      {refundsHref ? <StartNowField id="startNow" refundsHref={refundsHref} error={fe.startNow} /> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Placing your order…" : "Accept and order"}
      </Button>
    </form>
  );
}

export function DeclineQuoteForm({ reference }: { reference: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(declineQuoteAction, {});
  if (state.ok) return <Alert tone="positive">{state.message}</Alert>;
  if (!open) {
    return (
      <Button type="button" variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        Decline
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="reference" value={reference} />
      <TextareaField id="reason" label="Why not? (optional)" rows={3} maxLength={500} error={state.fieldErrors?.reason} hint="It helps us quote better next time." />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Declining…" : "Decline the quote"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
