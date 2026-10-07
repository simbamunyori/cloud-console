"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DateField, SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { addProtectionAction, setRestoreStatusAction, syncBackupsAction, updateProtectionAction } from "./actions";

type Option = { value: string; label: string };

function Result({ state }: { state: ActionState }) {
  if (state.fieldErrors) return <Alert>Check the highlighted fields.</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export interface ProtectionValues {
  label: string;
  health: string;
  lastSuccessAt: string;
  retentionDays: string;
  coverage: string;
  providerRef: string;
  notes: string;
}

/** Our team records a backup's status from the provider's portal. */
export function ProtectionForm({ id, values, healths }: { id: string; values: ProtectionValues; healths: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProtectionAction, {});
  const v = { ...values, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  const f = (name: string) => `${name}-${id}`;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={f("label")} name="label" label="What is backed up" defaultValue={v.label} error={fe.label} hint="Customers see this." />
        <SelectField id={f("health")} name="health" label="Status" options={healths} defaultValue={v.health} error={fe.health} />
        <DateField id={f("lastSuccessAt")} name="lastSuccessAt" label="Last good copy" defaultValue={v.lastSuccessAt} error={fe.lastSuccessAt} />
        <TextField id={f("retentionDays")} name="retentionDays" label="Copies kept for (days)" inputMode="numeric" defaultValue={v.retentionDays} error={fe.retentionDays} />
        <TextField id={f("coverage")} name="coverage" label="Covers" defaultValue={v.coverage} error={fe.coverage} hint="Plain words customers see, e.g. 12 mailboxes, 84 GB." />
        <TextField id={f("providerRef")} name="providerRef" label="Provider reference" defaultValue={v.providerRef} error={fe.providerRef} hint="Staff only. With an API, status is fetched by it." />
        <TextareaField id={f("notes")} name="notes" label="Notes" defaultValue={v.notes} error={fe.notes} hint="Staff only." rows={2} className="sm:col-span-2" />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/** A backup a customer already has, from before the console or set up by hand. */
export function AddProtectionForm({ customers }: { customers: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addProtectionAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Result state={state} />
      <SelectField id="organisationId" label="Customer" options={customers} placeholder="Choose a customer" defaultValue={v.organisationId ?? ""} error={fe.organisationId} />
      <TextField id="label" label="What is backed up" defaultValue={v.label ?? ""} error={fe.label} hint="For example: Microsoft 365 mailboxes, OneDrive and SharePoint." />
      <TextField id="reference" label="Billing service ID" defaultValue={v.reference ?? ""} error={fe.reference} hint="Optional. The backup's service in WHMCS, if it has one." />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add backup"}
        </Button>
      </div>
    </form>
  );
}

export function RestoreActions({ id, next }: { id: string; next: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setRestoreStatusAction, {});
  return (
    <div className="flex flex-col gap-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {next.map((n) => (
          <form key={n.value} action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={n.value} />
            <Button type="submit" size="sm" variant={n.value === "CANCELLED" ? "ghost" : "secondary"} disabled={pending}>
              {n.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(syncBackupsAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Fetching…" : "Fetch status now"}
      </Button>
    </form>
  );
}
