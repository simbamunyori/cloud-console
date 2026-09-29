"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { stubPayAction } from "./actions";

export function StubPayForm({ reference, label }: { reference: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(stubPayAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && !Object.keys(fe).length ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="ref" value={reference} />
      <TextField id="number" label="Card number" inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" defaultValue={state.values?.number} error={fe.number} />
      <div className="grid grid-cols-2 gap-4">
        <TextField id="expiry" label="Expiry" placeholder="MM/YY" autoComplete="off" defaultValue={state.values?.expiry} error={fe.expiry} />
        <TextField id="cvc" label="Security code" inputMode="numeric" autoComplete="off" maxLength={4} error={fe.cvc} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Paying…" : label}
      </Button>
    </form>
  );
}
