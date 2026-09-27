"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { changeOrganisationMarketAction, markContactedAction, saveMarketAction, setDefaultMarketAction, setMarketEnabledAction } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export interface MarketFormValues {
  code: string;
  name: string;
  countries: string;
  currency: string;
  locale: string;
  timeZone: string;
  taxEnabled: boolean;
  taxRatePercent: string;
  taxDisplay: "INCLUSIVE" | "EXCLUSIVE";
  taxLabel: string;
  taxRegistrationNumber: string;
  paymentMethods: string[];
  eftBankName: string;
  eftAccountName: string;
  eftAccountNumber: string;
  eftBranchCode: string;
  eftSwiftCode: string;
  supportEmail: string;
  supportPhone: string;
  supportHours: string;
  highlightedTlds: string;
  dataProtectionLaw: string;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-border pt-6 first:border-0 first:pt-0">
      <legend className="float-left mb-1 w-full">
        <span className="text-headline text-ink">{title}</span>
        {description ? <span className="mt-1 block text-callout text-ink-muted">{description}</span> : null}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Check({ name, value, label, defaultChecked }: { name: string; value?: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-body text-ink">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="size-5 accent-brand" />
      {label}
    </label>
  );
}

export function MarketSettingsForm({ market, catchAll }: { market: MarketFormValues; catchAll: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveMarketAction, {});
  const v = { ...market, ...(state.values ?? {}) } as MarketFormValues;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="code" value={market.code} />
      {state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : <Result state={state} />}
      <Section title="Market">
        <TextField id="name" label="Name" defaultValue={v.name} error={fe.name} />
        <TextField
          id="countries"
          label="Countries"
          defaultValue={v.countries}
          error={fe.countries}
          hint={catchAll ? "Leave empty: this market serves every country no other market lists." : "Two-letter codes, separated by commas, e.g. ZA."}
        />
        <TextField id="currency" label="Currency" defaultValue={v.currency} error={fe.currency} hint="ISO code, e.g. ZAR. Fixed once customers are billed in it." />
        <TextField id="locale" label="Locale" defaultValue={v.locale} error={fe.locale} hint="How amounts and dates are written, e.g. en-ZA." />
        <TextField id="timeZone" label="Time zone" defaultValue={v.timeZone} error={fe.timeZone} hint="e.g. Africa/Johannesburg." />
      </Section>
      <Section title="Tax" description="Charged by the billing engine. Keep WHMCS's tax rules the same when it is live.">
        <Check name="taxEnabled" label="Charge tax in this market" defaultChecked={v.taxEnabled} />
        <TextField id="taxRatePercent" label="Rate" inputMode="decimal" defaultValue={v.taxRatePercent} error={fe.taxRatePercent} hint="Percent, e.g. 14." />
        <TextField id="taxLabel" label="Tax name" defaultValue={v.taxLabel} error={fe.taxLabel} hint="Shown on invoices, e.g. VAT." />
        <SelectField
          id="taxDisplay"
          label="Show prices"
          defaultValue={v.taxDisplay}
          options={[
            { value: "EXCLUSIVE", label: "Before tax" },
            { value: "INCLUSIVE", label: "Including tax" },
          ]}
        />
        <TextField id="taxRegistrationNumber" label="Our registration number" defaultValue={v.taxRegistrationNumber} error={fe.taxRegistrationNumber} hint="Shown on invoices." />
      </Section>
      <Section title="Payments" description="EFT details are shown on invoices, with the invoice number as the reference.">
        <div className="flex flex-col sm:col-span-2 sm:flex-row sm:gap-8">
          <Check name="paymentMethods" value="card" label="Card" defaultChecked={v.paymentMethods.includes("card")} />
          <Check name="paymentMethods" value="eft" label="Bank transfer (EFT)" defaultChecked={v.paymentMethods.includes("eft")} />
        </div>
        {fe.paymentMethods ? <p className="text-callout text-negative sm:col-span-2">{fe.paymentMethods}</p> : null}
        <TextField id="eftBankName" label="Bank" defaultValue={v.eftBankName} error={fe.eftBankName} />
        <TextField id="eftAccountName" label="Account name" defaultValue={v.eftAccountName} error={fe.eftAccountName} />
        <TextField id="eftAccountNumber" label="Account number" defaultValue={v.eftAccountNumber} error={fe.eftAccountNumber} />
        <TextField id="eftBranchCode" label="Branch code" defaultValue={v.eftBranchCode} error={fe.eftBranchCode} />
        <TextField id="eftSwiftCode" label="SWIFT code" defaultValue={v.eftSwiftCode} error={fe.eftSwiftCode} />
      </Section>
      <Section title="Support and website">
        <TextField id="supportEmail" label="Support email" type="email" defaultValue={v.supportEmail} error={fe.supportEmail} />
        <TextField id="supportPhone" label="Support phone" type="tel" defaultValue={v.supportPhone} error={fe.supportPhone} />
        <TextField id="supportHours" label="Support hours" defaultValue={v.supportHours} error={fe.supportHours} />
        <TextField id="highlightedTlds" label="Domain endings shown first" defaultValue={v.highlightedTlds} error={fe.highlightedTlds} hint="e.g. .co.za, .com" />
        <TextField id="dataProtectionLaw" label="Data protection law" defaultValue={v.dataProtectionLaw} error={fe.dataProtectionLaw} hint="Named on the security page. Leave empty for none." />
      </Section>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

export function MarketSwitches({ code, enabled, isDefault }: { code: string; enabled: boolean; isDefault: boolean }) {
  const [toggled, toggle, toggling] = useActionState<ActionState, FormData>(setMarketEnabledAction, {});
  const [made, makeDefault, making] = useActionState<ActionState, FormData>(setDefaultMarketAction, {});
  return (
    <div className="flex flex-col gap-3">
      <Result state={toggled} />
      <Result state={made} />
      <div className="flex flex-wrap gap-3">
        {isDefault ? null : (
          <form action={toggle}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <Button type="submit" variant={enabled ? "secondary" : "primary"} disabled={toggling}>
              {enabled ? "Switch off" : "Switch on"}
            </Button>
          </form>
        )}
        {enabled && !isDefault ? (
          <form action={makeDefault}>
            <input type="hidden" name="code" value={code} />
            <Button type="submit" variant="secondary" disabled={making}>
              Make default
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function ChangeMarketForm({ organisationId, current, markets }: { organisationId: string; current: string; markets: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(changeOrganisationMarketAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state.fieldErrors ? { error: state.fieldErrors.market } : state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <SelectField id="market" label="Market" defaultValue={current} options={markets} hint="Sets prices and contacts. The currency can only change before the first invoice." />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Moving…" : "Move account"}
      </Button>
    </form>
  );
}

export function ContactedButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(markContactedAction, {});
  if (state.ok) return <span className="text-callout text-positive">Contacted</span>;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Mark contacted
      </Button>
    </form>
  );
}
