"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import { formatMoney, fromJson, times, type MoneyJson } from "@/lib/domain/money";
import type { ActionState } from "@/server/action-state";
import { contactAction, dnsAction, nameserversAction, renewDomainAction, transferCodeAction } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.fieldErrors) return <Alert>{state.error ?? "Check the highlighted fields."}</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export function RenewForm({ domainId, name, price, locale }: { domainId: string; name: string; price: MoneyJson; locale: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(renewDomainAction, {});
  const yearly = fromJson(price);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="domainId" value={domainId} />
      <Result state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField
          id="years"
          label={`Renew ${name} for`}
          defaultValue="1"
          options={[1, 2, 3, 5].map((y) => ({ value: String(y), label: `${y} ${y === 1 ? "year" : "years"}, ${formatMoney(times(yearly, y), locale)}` }))}
          className="sm:w-72"
        />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Ordering" : "Renew"}
        </Button>
      </div>
    </form>
  );
}

export function NameserversForm({ domainId, nameservers }: { domainId: string; nameservers: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(nameserversAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="domainId" value={domainId} />
      {state.fieldErrors ? null : <Result state={state} />}
      <TextareaField
        id="nameservers"
        label="Nameservers"
        rows={4}
        defaultValue={state.values?.nameservers ?? nameservers.join("\n")}
        error={state.fieldErrors?.nameservers}
        hint="One per line, two to six of them. Your website and email stop working if these are wrong, so copy them exactly from your host."
        spellCheck={false}
        autoCapitalize="none"
      />
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        Save nameservers
      </Button>
    </form>
  );
}

export interface DnsRow {
  type: string;
  name: string;
  value: string;
  ttl: string;
  priority: string;
}

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"].map((t) => ({ value: t, label: t }));
const blank: DnsRow = { type: "A", name: "", value: "", ttl: "3600", priority: "" };
let nextKey = 0;
const keyed = (r: DnsRow) => ({ ...r, key: nextKey++ });

export function DnsForm({ domainId, domain, records }: { domainId: string; domain: string; records: DnsRow[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(dnsAction, {});
  const [rows, setRows] = useState(() => (records.length ? records : [blank]).map(keyed));
  const fe = state.fieldErrors ?? {};
  // What was typed comes back with an error, so nothing typed is lost.
  const at = (i: number, k: keyof DnsRow, fallback: string) => state.values?.[`${k}-${i}`] ?? fallback;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="domainId" value={domainId} />
      <input type="hidden" name="rows" value={rows.length} />
      <Result state={state} />
      <ul className="flex flex-col gap-4">
        {rows.map((r, i) => (
          <li key={r.key} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-12 sm:items-start sm:border-0 sm:p-0">
            <SelectField className="sm:col-span-2" id={`type-${i}`} label="Type" options={TYPES} defaultValue={at(i, "type", r.type)} error={fe[`type-${i}`]} />
            <TextField className="sm:col-span-2" id={`name-${i}`} label="Name" defaultValue={at(i, "name", r.name)} error={fe[`name-${i}`]} placeholder="@" hint={i === 0 ? `@ is ${domain}` : undefined} autoCapitalize="none" spellCheck={false} />
            <TextField className="sm:col-span-4" id={`value-${i}`} label="Points to" defaultValue={at(i, "value", r.value)} error={fe[`value-${i}`]} autoCapitalize="none" spellCheck={false} />
            <TextField className="sm:col-span-1" id={`ttl-${i}`} label="TTL" inputMode="numeric" defaultValue={at(i, "ttl", r.ttl)} error={fe[`ttl-${i}`]} />
            <TextField className="sm:col-span-2" id={`priority-${i}`} label="Priority" inputMode="numeric" defaultValue={at(i, "priority", r.priority)} error={fe[`priority-${i}`]} hint={i === 0 ? "MX and SRV" : undefined} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:col-span-1 sm:mt-7"
              aria-label={`Remove record ${i + 1}`}
              onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => setRows((all) => [...all, keyed(blank)])}>
          <Plus aria-hidden /> Add a record
        </Button>
        <Button type="submit" disabled={pending}>
          Save DNS records
        </Button>
      </div>
    </form>
  );
}

export interface ContactValues {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
}

export function ContactForm({ domainId, contact, countries }: { domainId: string; contact: ContactValues; countries: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(contactAction, {});
  const v = { ...contact, ...(state.values ?? {}) } as ContactValues;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="domainId" value={domainId} />
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="firstName" label="First name" defaultValue={v.firstName} error={fe.firstName} autoComplete="given-name" />
        <TextField id="lastName" label="Last name" defaultValue={v.lastName} error={fe.lastName} autoComplete="family-name" />
        <TextField id="companyName" label="Company" defaultValue={v.companyName} error={fe.companyName} autoComplete="organization" />
        <TextField id="email" label="Email" type="email" defaultValue={v.email} error={fe.email} autoComplete="email" />
        <TextField id="phone" label="Phone" type="tel" defaultValue={v.phone} error={fe.phone} hint="With the country code, like +267 390 0000." autoComplete="tel" />
        <TextField id="address" label="Street address" defaultValue={v.address} error={fe.address} autoComplete="street-address" />
        <TextField id="city" label="Town or city" defaultValue={v.city} error={fe.city} autoComplete="address-level2" />
        <TextField id="postcode" label="Postcode" defaultValue={v.postcode} error={fe.postcode} autoComplete="postal-code" />
        <SelectField id="country" label="Country" options={countries} defaultValue={v.country} error={fe.country} placeholder="Choose a country" />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        Save owner details
      </Button>
    </form>
  );
}

export function TransferCodeForm({ domainId }: { domainId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transferCodeAction, {});
  if (state.ok && state.message)
    return (
      <div className="flex flex-col gap-2">
        <span className="text-callout text-ink-muted">Transfer code</span>
        <code className="w-fit rounded-md bg-surface-2 px-3 py-2 font-mono text-body text-ink select-all break-all">{state.message}</code>
        <span className="text-callout text-ink-muted">Give this to your new provider. We don&apos;t keep a copy.</span>
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="domainId" value={domainId} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        Show the transfer code
      </Button>
    </form>
  );
}
