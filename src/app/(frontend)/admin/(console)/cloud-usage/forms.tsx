"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { importUsageAction } from "./actions";

export function UploadUsageForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(importUsageAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <Field id="file" label="Usage file (CSV)" hint="Partner Center: Billing, then Daily rated usage, as CSV. An Azure cost export works too." error={fe.file}>
        {(describedBy, invalid) => (
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="text-callout text-ink file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:font-semibold file:text-ink"
          />
        )}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Importing…" : "Import usage"}
      </Button>
    </form>
  );
}
