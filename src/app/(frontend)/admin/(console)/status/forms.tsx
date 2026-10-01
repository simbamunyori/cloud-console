"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { openIncidentAction, resolveIncidentAction, updateIncidentAction } from "./actions";

const IMPACTS = [
  { value: "DEGRADED", label: "Slow or partly unavailable" },
  { value: "OUTAGE", label: "Down" },
  { value: "MAINTENANCE", label: "Planned maintenance" },
];

export function OpenIncidentForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(openIncidentAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} key={state.ok ? "done" : "form"} className="flex flex-col gap-4">
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <TextField id="title" label="What is affected" hint="Plain words, e.g. Email is slow to arrive." defaultValue={v.title} error={state.fieldErrors?.title} maxLength={120} required />
      <SelectField id="impact" label="How bad it is" options={IMPACTS} defaultValue={v.impact ?? "DEGRADED"} error={state.fieldErrors?.impact} />
      <TextareaField id="message" label="What customers should know" hint="Optional. What still works and what we are doing." defaultValue={v.message} error={state.fieldErrors?.message} maxLength={600} rows={3} />
      <Button type="submit" disabled={pending} className="w-fit">
        Post incident
      </Button>
    </form>
  );
}

export function UpdateIncidentForm({ id, message }: { id: string; message: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateIncidentAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <TextareaField id={`message-${id}`} name="message" label="Latest update" defaultValue={message ?? ""} maxLength={600} rows={2} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-fit">
        {state.ok ? "Updated" : "Save update"}
      </Button>
    </form>
  );
}

export function ResolveButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveIncidentAction, {});
  if (state.ok) return <span className="text-callout text-positive">Resolved</span>;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Button type="submit" size="sm" disabled={pending}>
        Mark resolved
      </Button>
    </form>
  );
}
