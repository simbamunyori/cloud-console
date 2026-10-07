"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { rescoreAction, setEmailDomainAction } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.fieldErrors) return <Alert>Check the highlighted fields.</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export function EmailDomainForm({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setEmailDomainAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Result state={state} />
      <TextField id="emailDomain" label="Email domain" defaultValue={state.values?.emailDomain ?? domain} error={state.fieldErrors?.emailDomain} hint="The part after @ in your work email, like yourcompany.co.bw." />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Checking…" : "Save and check"}
        </Button>
      </div>
    </form>
  );
}

export function RescoreButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(rescoreAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Checking…" : "Check again now"}
      </Button>
    </form>
  );
}
