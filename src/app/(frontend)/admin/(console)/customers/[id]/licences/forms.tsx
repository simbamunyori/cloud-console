"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { linkTenantAction, recordLicenceAction, recordUserAction } from "./actions";

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

export function LinkTenantForm({ organisationId, vendors }: { organisationId: string; vendors: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(linkTenantAction, {});
  const ref = useResetOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField id="vendor" label="Vendor" defaultValue={state.values?.vendor ?? vendors[0]?.value} options={vendors} error={fe.vendor} />
        <TextField id="primaryDomain" label="Sign-in domain" placeholder="kgalehill.co.bw" autoComplete="off" defaultValue={state.ok ? "" : state.values?.primaryDomain} error={fe.primaryDomain} />
        <TextField id="vendorTenantId" label="Tenant or customer id" hint="Optional, from the partner portal." autoComplete="off" defaultValue={state.ok ? "" : state.values?.vendorTenantId} error={fe.vendorTenantId} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Linking…" : "Link tenant"}
      </Button>
    </form>
  );
}

export function RecordLicenceForm({ organisationId, tenantId }: { organisationId: string; tenantId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordLicenceAction, {});
  const ref = useResetOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid gap-4 md:grid-cols-[2fr_3fr_1fr]">
        <TextField id="sku" label="SKU" placeholder="O365_BUSINESS_PREMIUM" autoComplete="off" defaultValue={state.ok ? "" : state.values?.sku} error={fe.sku} />
        <TextField id="name" label="Name customers see" placeholder="Microsoft 365 Business Premium" autoComplete="off" defaultValue={state.ok ? "" : state.values?.name} error={fe.name} />
        <TextField id="purchased" label="Bought" inputMode="numeric" autoComplete="off" defaultValue={state.ok ? "" : state.values?.purchased} error={fe.purchased} />
      </div>
      <p className="text-callout text-ink-muted">Recording an existing SKU again changes its count. It can&apos;t go below the number in use.</p>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Record licences"}
      </Button>
    </form>
  );
}

export function RecordUserForm({ organisationId, tenantId, licences }: { organisationId: string; tenantId: string; licences: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordUserAction, {});
  const ref = useResetOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField id="name" label="Name" autoComplete="off" defaultValue={state.ok ? "" : state.values?.name} error={fe.name} />
        <TextField id="email" label="Email" type="email" autoComplete="off" defaultValue={state.ok ? "" : state.values?.email} error={fe.email} />
      </div>
      {licences.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-callout font-semibold text-ink">Licences they hold</legend>
          {licences.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-ink">
              <input type="checkbox" name="licenceIds" value={l.id} className="size-4 accent-brand" />
              {l.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Record person"}
      </Button>
    </form>
  );
}
