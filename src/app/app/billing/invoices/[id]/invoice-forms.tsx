"use client";

import { Printer } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { setPoAction } from "../../actions";

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
