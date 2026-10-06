"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { registerInterestAction } from "./actions";

/** "Talk to us about it" while managed security isn't published yet. */
export function InterestForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerInterestAction, {});
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : state.error ? <Alert>{state.error}</Alert> : null}
      <TextField id="devices" label="About how many computers?" inputMode="numeric" defaultValue={state.values?.devices ?? ""} error={state.fieldErrors?.devices} />
      <TextareaField id="note" label="Anything we should know?" defaultValue={state.values?.note ?? ""} rows={3} hint="Optional." />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Talk to a security specialist"}
        </Button>
      </div>
    </form>
  );
}
