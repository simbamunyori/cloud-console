"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DateField, SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { savePartnerRecordAction } from "./actions";

export interface PartnerRecordValues {
  id?: string;
  name: string;
  category: string;
  status: string;
  contacts: string;
  agreementRef: string;
  agreementUrl: string;
  startsOn: string;
  renewsOn: string;
  noticeDays: string;
  products: string;
  notes: string;
}

type Option = { value: string; label: string };

export function PartnerRecordForm({ record, categories, statuses }: { record: PartnerRecordValues; categories: Option[]; statuses: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePartnerRecordAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const isNew = !record.id;
  useEffect(() => {
    if (state.ok && isNew) formRef.current?.reset();
  }, [state, isNew]);
  const fe = state.fieldErrors ?? {};
  const v = (k: keyof PartnerRecordValues) => (state.ok && isNew ? "" : (state.values?.[k] ?? record[k] ?? ""));
  const id = (k: string) => `${record.id ?? "new"}-${k}`;
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {record.id ? <input type="hidden" name="id" value={record.id} /> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <TextField id={id("name")} name="name" label="Partner" required defaultValue={v("name")} error={fe.name} />
        <SelectField id={id("category")} name="category" label="Category" defaultValue={v("category") || categories[0].value} options={categories} error={fe.category} />
        <SelectField id={id("status")} name="status" label="Status" defaultValue={v("status") || "ACTIVE"} options={statuses} error={fe.status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <TextField id={id("agreementRef")} name="agreementRef" label="Agreement reference" defaultValue={v("agreementRef")} error={fe.agreementRef} />
        <DateField id={id("startsOn")} name="startsOn" label="Started" defaultValue={v("startsOn")} error={fe.startsOn} />
        <DateField id={id("renewsOn")} name="renewsOn" label="Renews" defaultValue={v("renewsOn")} error={fe.renewsOn} />
        <TextField id={id("noticeDays")} name="noticeDays" label="Notice (days)" inputMode="numeric" defaultValue={v("noticeDays") || "60"} error={fe.noticeDays} />
      </div>
      <TextField id={id("agreementUrl")} name="agreementUrl" label="Where the signed agreement is kept (optional)" type="url" placeholder="https://" defaultValue={v("agreementUrl")} error={fe.agreementUrl} />
      <TextField
        id={id("products")}
        name="products"
        label="Products that depend on it"
        hint="Catalogue product slugs, separated by commas, such as business-email, managed-backup."
        defaultValue={v("products")}
        error={fe.products}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <TextareaField id={id("contacts")} name="contacts" label="Contacts" rows={3} hint="Names, roles, emails and phone numbers." defaultValue={v("contacts")} error={fe.contacts} />
        <TextareaField id={id("notes")} name="notes" label="Notes" rows={3} defaultValue={v("notes")} error={fe.notes} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : isNew ? "Add partner" : "Save"}
      </Button>
    </form>
  );
}
