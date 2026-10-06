"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DateField, SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import {
  createIncidentAction,
  escalateAction,
  removeDeviceAction,
  saveDeviceAction,
  saveProviderAction,
  saveSocReportAction,
  saveSocSettingsAction,
  saveTenantAction,
  setProviderActiveAction,
  testProviderAction,
  updateIncidentAction,
} from "./actions";

type Option = { value: string; label: string };

function Result({ state }: { state: ActionState }) {
  if (state.fieldErrors) return <Alert>Check the highlighted fields.</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

/** Staff open an incident by hand: manual mode, or a customer who calls in. */
export function NewIncidentForm({ customers, severities }: { customers: Option[]; severities: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createIncidentAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Result state={state} />
      <SelectField id="organisationId" label="Customer" options={customers} placeholder="Choose a customer" defaultValue={v.organisationId ?? ""} error={fe.organisationId} />
      <TextField id="title" label="What happened" defaultValue={v.title ?? ""} error={fe.title} hint="Customers see this." />
      <TextareaField id="summary" label="Details" defaultValue={v.summary ?? ""} error={fe.summary} hint="Customers see this. Plain words, no provider names." rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="severity" label="Severity" options={severities} defaultValue={v.severity ?? "MEDIUM"} error={fe.severity} />
        <TextField id="deviceName" label="Device" defaultValue={v.deviceName ?? ""} error={fe.deviceName} hint="Optional." />
      </div>
      <p className="text-callout text-ink-muted">Medium severity and above emails the customer&apos;s owners and admins.</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Opening…" : "Open incident"}
        </Button>
      </div>
    </form>
  );
}

export function IncidentForm({ id, reference, values, statuses, staff }: { id: string; reference: string; values: { status: string; ourAction: string; assigneeId: string }; statuses: Option[]; staff: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateIncidentAction, {});
  const v = { ...values, ...(state.ok ? {} : (state.values ?? {})) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reference" value={reference} />
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="status" label="Status" options={statuses} defaultValue={v.status} error={fe.status} />
        <SelectField id="assigneeId" label="Assigned to" options={staff} placeholder="Nobody yet" defaultValue={v.assigneeId} error={fe.assigneeId} />
      </div>
      <TextareaField id="ourAction" label="What we are doing" defaultValue={v.ourAction} error={fe.ourAction} hint="The customer reads this on the incident page." rows={3} />
      <TextareaField id="note" label="Internal note" defaultValue={state.ok ? "" : (state.values?.note ?? "")} error={fe.note} hint="Staff only." rows={2} />
      <label className="flex items-center gap-2 text-ink">
        <input type="checkbox" name="notify" className="size-4" />
        Email the customer&apos;s owners and admins about this update
      </label>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function EscalateForm({ id, reference }: { id: string; reference: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(escalateAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reference" value={reference} />
      <Result state={state} />
      <TextField id="why" label="Why" hint="Emailed to the escalation address with the incident." />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Escalating…" : "Escalate"}
        </Button>
      </div>
    </form>
  );
}

export function SocSettingsForm({ values }: { values: Record<"critical" | "high" | "medium" | "low" | "escalationEmail", string> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSocSettingsAction, {});
  const v = { ...values, ...(state.ok ? {} : (state.values ?? {})) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="critical" label="Critical (minutes)" inputMode="numeric" defaultValue={v.critical} error={fe.critical} />
        <TextField id="high" label="High (minutes)" inputMode="numeric" defaultValue={v.high} error={fe.high} />
        <TextField id="medium" label="Medium (minutes)" inputMode="numeric" defaultValue={v.medium} error={fe.medium} />
        <TextField id="low" label="Low (minutes)" inputMode="numeric" defaultValue={v.low} error={fe.low} />
      </div>
      <TextField id="escalationEmail" label="Escalation email" type="email" defaultValue={v.escalationEmail} error={fe.escalationEmail} hint="Late and escalated incidents are emailed here. Empty means no email." />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function TenantForm({ organisationId, values, statuses }: { organisationId: string; values: { tenantRef: string; status: string; enrolmentLink: string; enrolmentNote: string }; statuses: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTenantAction, {});
  const v = { ...values, ...(state.ok ? {} : (state.values ?? {})) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organisationId" value={organisationId} />
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="status" label="Status" options={statuses} defaultValue={v.status} error={fe.status} />
        <TextField id="tenantRef" label="Provider tenant reference" defaultValue={v.tenantRef} error={fe.tenantRef} hint="Staff only." />
      </div>
      <TextField id="enrolmentLink" label="Agent install link" defaultValue={v.enrolmentLink} error={fe.enrolmentLink} hint="The customer sees it on their Managed security page." />
      <TextareaField id="enrolmentNote" label="Install note" defaultValue={v.enrolmentNote} error={fe.enrolmentNote} hint="The customer sees it. No provider names." rows={2} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function DeviceForm({ organisationId, device, healths }: { organisationId: string; device?: { id: string; name: string; os: string; health: string; lastSeenAt: string }; healths: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveDeviceAction, {});
  const v = { name: "", os: "", health: "HEALTHY", lastSeenAt: "", ...device, ...(state.ok ? {} : (state.values ?? {})) };
  const fe = state.fieldErrors ?? {};
  const f = (name: string) => `${name}-${device?.id ?? "new"}`;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organisationId" value={organisationId} />
      {device ? <input type="hidden" name="deviceId" value={device.id} /> : null}
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={f("name")} name="name" label="Device" defaultValue={v.name} error={fe.name} />
        <TextField id={f("os")} name="os" label="System" defaultValue={v.os} error={fe.os} hint="For example: Windows 11." />
        <SelectField id={f("health")} name="health" label="Status" options={healths} defaultValue={v.health} error={fe.health} />
        <DateField id={f("lastSeenAt")} name="lastSeenAt" label="Last seen" defaultValue={v.lastSeenAt} error={fe.lastSeenAt} />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : device ? "Save" : "Add device"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveDeviceButton({ organisationId, id }: { organisationId: string; id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeDeviceAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="deviceId" value={id} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="w-fit">
        Remove
      </Button>
    </form>
  );
}

export function SocReportForm({ organisationId, month }: { organisationId: string; month: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSocReportAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organisationId" value={organisationId} />
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="month" label="Month" defaultValue={v.month ?? month} error={fe.month} hint="Like 2026-10. The same month again replaces it." />
        <TextField id="title" label="Title" defaultValue={v.title ?? ""} error={fe.title} />
      </div>
      <TextareaField id="summary" label="Summary" defaultValue={v.summary ?? ""} error={fe.summary} rows={3} hint="The customer reads this. No provider names." />
      <TextField id="url" label="Report link" defaultValue={v.url ?? ""} error={fe.url} hint="Optional. A white-labelled report, starting with https://." />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save report"}
        </Button>
      </div>
    </form>
  );
}

// ─── Admin > Partners > Security provider ───────────────────────────

export interface ProviderFormValues {
  id: string | null;
  type: string;
  name: string;
  endpoint: string;
  tenantSettings: string;
  customFields: string;
  secretsSet: { apiKey: boolean; apiSecret: boolean; webhookSecret: boolean };
}

export function ProviderForm({ values, types }: { values: ProviderFormValues; types: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProviderAction, {});
  const v = { ...values, ...(state.ok && !values.id ? { name: "", endpoint: "", tenantSettings: "", customFields: "" } : {}), ...(state.ok ? {} : (state.values ?? {})) };
  const fe = state.fieldErrors ?? {};
  const f = (name: string) => `${name}-${values.id ?? "new"}`;
  const secretHint = (set: boolean, more?: string) => [set ? "Saved. Leave empty to keep it." : "Not set yet.", more].filter(Boolean).join(" ");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={f("name")} name="name" label="Provider name" defaultValue={v.name} error={fe.name} hint="Staff only. Customers never see it." />
        <SelectField id={f("type")} name="type" label="How we connect" options={types} defaultValue={v.type} error={fe.type} />
        <TextField id={f("endpoint")} name="endpoint" label="API endpoint" defaultValue={v.endpoint} error={fe.endpoint} hint="Starts with https://. Not needed in manual mode." className="sm:col-span-2" />
        <TextField id={f("apiKey")} name="apiKey" label="API key" type="password" autoComplete="new-password" error={fe.apiKey} hint={secretHint(v.secretsSet.apiKey)} />
        <TextField id={f("apiSecret")} name="apiSecret" label="API secret" type="password" autoComplete="new-password" error={fe.apiSecret} hint={secretHint(v.secretsSet.apiSecret, "Optional.")} />
        <TextField id={f("webhookSecret")} name="webhookSecret" label="Webhook signing secret" type="password" autoComplete="new-password" error={fe.webhookSecret} hint={secretHint(v.secretsSet.webhookSecret)} />
        <TextareaField id={f("tenantSettings")} name="tenantSettings" label="Account settings" defaultValue={v.tenantSettings} error={fe.tenantSettings} rows={3} hint="One per line, like region=af-south-1. Sent as headers." spellCheck={false} />
        <TextareaField id={f("customFields")} name="customFields" label="Custom fields" defaultValue={v.customFields} error={fe.customFields} rows={3} hint="One per line, like partner-id=123. Sent as headers." spellCheck={false} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save provider" : "Add provider"}
        </Button>
      </div>
    </form>
  );
}

export function TestProviderButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(testProviderAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        {pending ? "Testing…" : "Test connection"}
      </Button>
    </form>
  );
}

export function ProviderActiveButton({ id, active, canActivate }: { id: string; active: boolean; canActivate: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setProviderActiveAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Result state={state} />
      <Button type="submit" variant={active ? "secondary" : "primary"} disabled={pending || (!active && !canActivate)} className="w-fit">
        {active ? "Switch off" : "Make active"}
      </Button>
    </form>
  );
}
