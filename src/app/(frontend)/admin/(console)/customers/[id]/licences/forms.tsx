"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { finishOnboardingAction, linkTenantAction, recordLicenceAction, recordUserAction, saveChecksAction, saveOnboardingAction, setConsentAction, tickStaffAction } from "./actions";

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

export function OnboardingForm({ organisationId, tenantId, current }: { organisationId: string; tenantId: string; current: { kind: string; verificationValue: string | null; partnerInviteUrl: string | null } | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOnboardingAction, {});
  const fe = state.fieldErrors ?? {};
  const id = (k: string) => `${k}-${tenantId}`;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          id={id("kind")}
          name="kind"
          label="Setup"
          defaultValue={state.values?.kind ?? current?.kind ?? "NEW"}
          options={[
            { value: "NEW", label: "New tenant" },
            { value: "TRANSFER", label: "Transfer from another provider" },
          ]}
          error={fe.kind}
        />
        <TextField id={id("verificationValue")} name="verificationValue" label="Domain verification value" placeholder="MS=ms48213377" hint="The TXT value from the portal." autoComplete="off" defaultValue={state.values?.verificationValue ?? current?.verificationValue ?? ""} error={fe.verificationValue} />
        <TextField id={id("partnerInviteUrl")} name="partnerInviteUrl" label="Partner invitation link" hint="For a transfer." autoComplete="off" defaultValue={state.values?.partnerInviteUrl ?? current?.partnerInviteUrl ?? ""} error={fe.partnerInviteUrl} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : current ? "Save setup" : "Start setup"}
      </Button>
    </form>
  );
}

export function StaffTick({ organisationId, onboardingId, itemKey, done }: { organisationId: string; onboardingId: string; itemKey: string; done: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(tickStaffAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <input type="hidden" name="key" value={itemKey} />
      <input type="hidden" name="done" value={done ? "no" : "yes"} />
      <Button type="submit" size="sm" variant={done ? "ghost" : "secondary"} disabled={pending}>
        {done ? "Undo" : "Mark done"}
      </Button>
      {state.error ? <span className="text-caption text-negative">{state.error}</span> : null}
    </form>
  );
}

export function FinishOnboardingButton({ organisationId, onboardingId }: { organisationId: string; onboardingId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(finishOnboardingAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Finishing…" : "Finish setup"}
      </Button>
      <Messages state={state} />
    </form>
  );
}

/** Admin access the customer gave us (U6): recorded by hand in manual mode, or to correct the sync. */
export function ConsentSwitch({ organisationId, tenantId, granted }: { organisationId: string; tenantId: string; granted: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setConsentAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="granted" value={granted ? "false" : "true"} />
      <Messages state={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {granted ? "Mark access as removed" : "Mark access as given"}
      </Button>
    </form>
  );
}

export function SecurityChecksForm({ organisationId, tenantId, current }: { organisationId: string; tenantId: string; current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveChecksAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <Messages state={state} />
      <TextareaField
        id={`checks-${tenantId}`}
        name="checks"
        label="Security settings"
        rows={6}
        defaultValue={state.ok ? current : (state.values?.checks ?? current)}
        error={state.fieldErrors?.checks}
        hint='One per line, as "setting=yes" or "setting=no", e.g. "Multi-factor sign-in required for everyone=no". Customers see the ones set to no.'
        spellCheck={false}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="w-fit">
        Save settings
      </Button>
    </form>
  );
}
