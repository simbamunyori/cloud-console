"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { declineFromLinkAction, openQuoteInAccountAction } from "../actions";

export function OpenInAccountForm({ token, organisation }: { token: string; organisation: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(openQuoteInAccountAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Opening…" : `Review and accept in ${organisation}`}
      </Button>
    </form>
  );
}

/** Declining needs no account. */
export function DeclineFromLinkForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(declineFromLinkAction, {});
  if (state.ok) return <Alert tone="positive">{state.message}</Alert>;
  if (!open) {
    return (
      <Button type="button" variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        Decline this quote
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
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
