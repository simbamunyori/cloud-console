"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { budgetAction, savingAction } from "./actions";

export function SavingActions({ tipId, title }: { tipId: string; title: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savingAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="tipId" value={tipId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="ask" size="sm" disabled={pending} aria-label={`Ask us to do it: ${title}`}>
          Ask us to do it
        </Button>
        <Button type="submit" name="intent" value="dismiss" size="sm" variant="ghost" disabled={pending} aria-label={`Hide: ${title}`}>
          Hide
        </Button>
      </div>
      {state.error ? <span className="text-caption text-negative">{state.error}</span> : null}
    </form>
  );
}

/** Set, change or remove a subscription's monthly budget. Opens from a link to keep the card quiet. */
export function BudgetForm({ subscriptionId, name, current, currencySymbol }: { subscriptionId: string; name: string; current: string; currencySymbol: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(budgetAction, {});
  const [open, setOpen] = useState(false);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }
  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        {state.ok && state.message ? <span className="text-caption text-positive">{state.message}</span> : null}
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setOpen(true)}>
          {current ? "Change the budget" : "Set a monthly budget"}
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <MoneyField
        id={`budget-${subscriptionId}`}
        name="budget"
        label={`Monthly budget for ${name}`}
        hint="We email owners, admins and billing people if usage is on course to go over, and at 80% and 100%. Leave it empty for no budget."
        currencySymbol={currencySymbol}
        defaultValue={state.values?.budget ?? current}
        error={state.error}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save budget"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
