"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { MoneyField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { addSavingAction, linkSubscriptionAction } from "./actions";

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

function Messages({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  return null;
}

export function LinkSubscriptionForm({ organisationId, defaultMargin }: { organisationId: string; defaultMargin: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(linkSubscriptionAction, {});
  const ref = useResetOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  const v = state.ok ? undefined : state.values;
  return (
    <form ref={ref} action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-4 md:grid-cols-[2fr_2fr_1fr]">
        <TextField id="subscriptionId" label="Azure subscription id" hint="EntitlementId in Partner Center usage files." autoComplete="off" defaultValue={v?.subscriptionId} error={fe.subscriptionId} />
        <TextField id="name" label="Name the customer sees" placeholder="Production" autoComplete="off" defaultValue={v?.name} error={fe.name} />
        <TextField id="margin" label="Our margin, %" inputMode="decimal" autoComplete="off" defaultValue={v?.margin ?? defaultMargin} error={fe.margin} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Link subscription"}
      </Button>
    </form>
  );
}

export function AddSavingForm({ organisationId, currencySymbol }: { organisationId: string; currencySymbol: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSavingAction, {});
  const ref = useResetOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  const v = state.ok ? undefined : state.values;
  return (
    <form ref={ref} action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-4 md:grid-cols-[3fr_1fr]">
        <TextField id="title" label="What to change" placeholder="The accounts server is bigger than it needs to be" autoComplete="off" defaultValue={v?.title} error={fe.title} />
        <MoneyField id="monthly" label="Saves a month" currencySymbol={currencySymbol} defaultValue={v?.monthly} error={fe.monthly} />
      </div>
      <TextareaField id="detail" name="detail" label="Explain it to the customer" hint="Plain words: what we'd change and what it means for them." rows={3} defaultValue={v?.detail} error={fe.detail} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add the saving"}
      </Button>
    </form>
  );
}
