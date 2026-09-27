"use client";

import { Printer } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DateField, MoneyField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { reportEftAction, setPoAction } from "../../actions";

export function PoForm({ invoiceId, current }: { invoiceId: string; current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setPoAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          id="poNumber"
          label="Purchase order number"
          hint="Shown on this invoice and on the copy we email. Leave empty to remove it."
          defaultValue={state.values?.poNumber ?? current}
          maxLength={40}
          error={state.fieldErrors?.poNumber}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden /> Print or save as PDF
    </Button>
  );
}

export function EftReportForm({ invoiceId, amount, currencySymbol, reference, today }: { invoiceId: string; amount: string; currencySymbol: string; reference: string; today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(reportEftAction, {});
  if (state.ok) return <Alert tone="positive">{state.message}</Alert>;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyField id="amount" label="Amount paid" currencySymbol={currencySymbol} defaultValue={state.values?.amount ?? amount} error={fe.amount} />
        <DateField id="paidOn" label="Date paid" max={today} defaultValue={state.values?.paidOn ?? today} error={fe.paidOn} />
        <TextField id="reference" label="Reference you used" defaultValue={state.values?.reference ?? reference} maxLength={60} error={fe.reference} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Tell us you've paid"}
      </Button>
    </form>
  );
}
