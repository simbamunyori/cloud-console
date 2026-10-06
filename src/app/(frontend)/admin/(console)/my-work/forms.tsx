"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { saveContactCardAction } from "./actions";

export function ContactCardForm({ current }: { current: { jobTitle: string; phone: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveContactCardAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField id="jobTitle" name="jobTitle" label="Job title" hint="Such as Account manager." defaultValue={state.values?.jobTitle ?? current.jobTitle} error={fe.jobTitle} />
        <TextField id="phone" name="phone" label="Direct phone" type="tel" hint="Optional. Customers can call it." defaultValue={state.values?.phone ?? current.phone} error={fe.phone} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save my contact card"}
      </Button>
    </form>
  );
}
