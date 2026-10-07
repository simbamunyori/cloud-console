"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { pushCompanyAction, saveBankAccountAction, saveCompanyAction, saveLogoAction } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.fieldErrors) return <Alert>Check the highlighted fields.</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export interface CompanyFormValues {
  legalName: string;
  tradingName: string;
  registrationNumber: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  invoiceFooter: string;
  paymentTerms: string;
  quoteTerms: string;
}

export function CompanyForm({ company }: { company: CompanyFormValues }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCompanyAction, {});
  const v = { ...company, ...(state.values ?? {}) } as CompanyFormValues;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="legalName" label="Legal name" defaultValue={v.legalName} error={fe.legalName} hint="On invoices, quotes and the website footer." />
        <TextField id="tradingName" label="Trading name" defaultValue={v.tradingName} error={fe.tradingName} />
        <TextField id="registrationNumber" label="Company registration number" defaultValue={v.registrationNumber} error={fe.registrationNumber} />
        <TextField id="email" label="Email" type="email" defaultValue={v.email} error={fe.email} hint="Where customers write about invoices." />
        <TextField id="phone" label="Phone" type="tel" defaultValue={v.phone} error={fe.phone} hint="With the country code, e.g. +267 74339657." />
        <TextField id="website" label="Website" defaultValue={v.website} error={fe.website} hint="Starts with https://." />
        <TextareaField id="address" label="Address" className="sm:col-span-2" rows={4} defaultValue={v.address} error={fe.address} hint="One part per line." />
        <TextareaField id="paymentTerms" label="Payment terms" className="sm:col-span-2" rows={2} defaultValue={v.paymentTerms} error={fe.paymentTerms} hint="Printed on every invoice." />
        <TextareaField id="quoteTerms" label="Quote terms" className="sm:col-span-2" rows={3} defaultValue={v.quoteTerms} error={fe.quoteTerms} hint="Printed on every quote." />
        <TextField id="invoiceFooter" label="Invoice footer" className="sm:col-span-2" defaultValue={v.invoiceFooter} error={fe.invoiceFooter} hint="A short line at the foot of invoices and quotes." />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        Save company details
      </Button>
    </form>
  );
}

export function LogoForm({ kind, custom }: { kind: "light" | "dark"; custom: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveLogoAction, {});
  const id = `logo-${kind}`;
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3" key={state.ok ? `done-${state.message}` : "form"}>
        <input type="hidden" name="kind" value={kind} />
        {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
        {state.error ? <Alert>{state.error}</Alert> : null}
        <TextField
          id={id}
          label={kind === "light" ? "Upload a logo for light backgrounds" : "Upload a logo for dark backgrounds"}
          type="file"
          accept="image/png"
          error={state.fieldErrors?.[id]}
          hint="PNG, at least 300 pixels wide, under 1 MB."
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-fit">
          Upload
        </Button>
      </form>
      {custom ? (
        <form action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="reset" value="true" />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            Use the standard logo
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export interface BankFormValues {
  marketCode: string;
  currency: string;
  bankName: string;
  branchName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  swiftCode: string;
}

export function BankAccountForm({ initial, markets, fixed }: { initial: BankFormValues; markets: { code: string; name: string }[]; fixed?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBankAccountAction, {});
  const v = { ...initial, ...(state.values ?? {}) } as BankFormValues;
  const fe = state.fieldErrors ?? {};
  const p = fixed ? `${initial.marketCode}-${initial.currency}-` : "new-";
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fixed ? (
          <>
            <input type="hidden" name="marketCode" value={initial.marketCode} />
            <input type="hidden" name="currency" value={initial.currency} />
          </>
        ) : (
          <>
            <SelectField id={`${p}marketCode`} name="marketCode" label="Market" options={markets.map((m) => ({ value: m.code, label: m.name }))} defaultValue={v.marketCode} error={fe.marketCode} />
            <TextField id={`${p}currency`} name="currency" label="Currency" defaultValue={v.currency} error={fe.currency} hint="The three-letter code of the account's currency." maxLength={3} />
          </>
        )}
        <TextField id={`${p}bankName`} name="bankName" label="Bank" defaultValue={v.bankName} error={fe.bankName} />
        <TextField id={`${p}branchName`} name="branchName" label="Branch" defaultValue={v.branchName} error={fe.branchName} />
        <TextField id={`${p}accountName`} name="accountName" label="Account name" defaultValue={v.accountName} error={fe.accountName} />
        <TextField id={`${p}accountNumber`} name="accountNumber" label="Account number" defaultValue={v.accountNumber} error={fe.accountNumber} />
        <TextField id={`${p}branchCode`} name="branchCode" label="Branch code" defaultValue={v.branchCode} error={fe.branchCode} />
        <TextField id={`${p}swiftCode`} name="swiftCode" label="SWIFT code" defaultValue={v.swiftCode} error={fe.swiftCode} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {fixed ? "Save account" : "Add account"}
      </Button>
    </form>
  );
}

export function PushCompanyForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(pushCompanyAction, {});
  return (
    <div className="flex flex-col gap-3">
      <Result state={state} />
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="apply" value="false" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Check what would change
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="apply" value="true" />
          <Button type="submit" disabled={pending}>
            Send to WHMCS
          </Button>
        </form>
      </div>
    </div>
  );
}
