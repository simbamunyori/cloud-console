"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { saveLicenceAction } from "./actions";

export function LicenceForm({ market, current }: { market: string; current: { regulator: string; reference: string; grantedOn: string } | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveLicenceAction, {});
  const fe = state.fieldErrors ?? {};
  const v = { ...(current ?? { regulator: "", reference: "", grantedOn: "" }), ...(state.values ?? {}) };
  const id = (k: string) => `${k}-${market}`;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <input type="hidden" name="market" value={market} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField id={id("regulator")} name="regulator" label="Granted by" hint="Such as BOCRA." defaultValue={v.regulator} error={fe.regulator} />
        <TextField id={id("reference")} name="reference" label="Licence number" defaultValue={v.reference} error={fe.reference} />
        <TextField id={id("grantedOn")} name="grantedOn" label="Granted on" type="date" defaultValue={v.grantedOn} error={fe.grantedOn} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : current ? "Save the licence" : "Record the licence"}
        </Button>
        {current ? (
          <Button type="submit" name="remove" value="1" variant="ghost" disabled={pending}>
            Remove it
          </Button>
        ) : null}
      </div>
    </form>
  );
}
