"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { refreshSuccessAction, saveSuccessSettingsAction } from "./actions";

export function RefreshButton() {
  const [state, action, pending] = useActionState<ActionState>(refreshSuccessAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      {state.error ? <span className="text-callout text-negative">{state.error}</span> : state.ok ? <span className="text-callout text-positive">{state.message}</span> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Working it out…" : "Refresh now"}
      </Button>
    </form>
  );
}

export function SuccessSettingsForm({ emails, figures }: { emails: string; figures: { key: string; label: string; hint: string; value: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSuccessSettingsAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {figures.map((f) => (
          <TextField key={f.key} id={f.key} label={f.label} hint={f.hint} inputMode="decimal" defaultValue={state.values?.[f.key] ?? f.value} error={fe[f.key]} />
        ))}
      </div>
      <TextareaField
        id="directorEmails"
        label="Directors who get the monthly email"
        rows={3}
        hint="One address per line. The email goes on the 1st of each month once Monthly success email is on in Features."
        defaultValue={state.values?.directorEmails ?? emails}
        error={fe.directorEmails}
      />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save targets"}
      </Button>
    </form>
  );
}
