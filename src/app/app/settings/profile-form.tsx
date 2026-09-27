"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { updateProfileAction } from "./actions";

type Values = Record<
  "name" | "registrationNumber" | "vatNumber" | "billingEmail" | "phone" | "addressLine1" | "addressLine2" | "city" | "postcode" | "defaultPoNumber",
  string
>;

export function ProfileForm({ initial, editable }: { initial: Values; editable: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProfileAction, {});
  const v = (state.values as Values | undefined) ?? initial;
  const fe = state.fieldErrors ?? {};
  const f = (id: keyof Values, label: string, extra: Record<string, unknown> = {}) => (
    <TextField id={id} label={label} defaultValue={v[id]} error={fe[id]} disabled={!editable} {...extra} />
  );
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert tone="positive">{state.message}</Alert> : null}
      {f("name", "Name", { required: true, autoComplete: "organization" })}
      <div className="grid gap-5 sm:grid-cols-2">
        {f("registrationNumber", "Registration number")}
        {f("vatNumber", "VAT number")}
        {f("billingEmail", "Billing email", { type: "email", inputMode: "email", hint: "Invoices and payment receipts go here." })}
        {f("phone", "Phone", { type: "tel", autoComplete: "tel" })}
      </div>
      {f("addressLine1", "Address", { autoComplete: "address-line1" })}
      {f("addressLine2", "Address line 2", { autoComplete: "address-line2" })}
      <div className="grid gap-5 sm:grid-cols-2">
        {f("city", "City or town", { autoComplete: "address-level2" })}
        {f("postcode", "Postcode", { autoComplete: "postal-code" })}
      </div>
      {f("defaultPoNumber", "Default purchase order number", { hint: "Shown on every invoice until you change it. You can also set one per invoice." })}
      {editable ? (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save changes"}
        </Button>
      ) : null}
    </form>
  );
}
