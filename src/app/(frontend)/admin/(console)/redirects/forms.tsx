"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { removeRedirectAction, saveRedirectAction } from "./actions";

export function RedirectForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveRedirectAction, {});
  const fe = state.fieldErrors ?? {};
  const values = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField id="fromPath" name="fromPath" label="Old address" hint="The path on the old site, for example /new/web-hosting." defaultValue={values.fromPath} error={fe.fromPath} required />
        <TextField id="toPath" name="toPath" label="Goes to" hint="A page on the new site, for example /bw/pricing. Use / for the home page." defaultValue={values.toPath} error={fe.toPath} required />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save the address"}
      </Button>
    </form>
  );
}

export function RemoveForm({ id, fromPath }: { id: string; fromPath: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeRedirectAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} aria-label={`Remove ${fromPath}`}>
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}
