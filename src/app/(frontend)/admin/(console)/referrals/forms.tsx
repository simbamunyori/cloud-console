"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { decideAction, payoutAction, referralSettingsAction, updatePartnerAction } from "./actions";

function Note({ state }: { state: ActionState }) {
  if (state.ok && state.message) return <p className="text-callout text-positive">{state.message}</p>;
  if (state.error && !state.fieldErrors) return <p className="text-callout text-negative">{state.error}</p>;
  return null;
}

export function DecideForm({ id, defaultPercent }: { id: string; defaultPercent: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 sm:items-end">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <TextField id={`commission-${id}`} name="commission" label="Commission %" placeholder={defaultPercent} inputMode="decimal" className="w-32" defaultValue={state.values?.commission} error={state.fieldErrors?.commission} />
        <Button type="submit" name="decision" value="approve" disabled={pending} className="h-11">
          Approve
        </Button>
        <Button type="submit" name="decision" value="decline" variant="ghost" disabled={pending} className="h-11">
          Decline
        </Button>
      </div>
      <Note state={state} />
    </form>
  );
}

export function PartnerForm({ id, status, commission, defaultPercent }: { id: string; status: string; commission: string; defaultPercent: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updatePartnerAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 sm:items-end">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <TextField id={`pc-${id}`} name="commission" label="Commission %" placeholder={defaultPercent} inputMode="decimal" className="w-32" defaultValue={state.values?.commission ?? commission} error={state.fieldErrors?.commission} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`ps-${id}`} className="text-callout font-semibold text-ink">
            Status
          </label>
          <select id={`ps-${id}`} name="status" defaultValue={status} className="h-11 rounded-md border border-border-strong bg-surface-1 px-3 text-callout text-ink">
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
          </select>
        </div>
        <Button type="submit" variant="secondary" disabled={pending} className="h-11">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Note state={state} />
    </form>
  );
}

export function SettingsForm({ percent }: { percent: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(referralSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <TextField id="commission" label="Default commission %" inputMode="decimal" className="w-40" defaultValue={state.values?.commission ?? percent} error={state.fieldErrors?.commission} />
        <Button type="submit" variant="secondary" disabled={pending} className="h-11">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Note state={state} />
    </form>
  );
}

export function PayoutForm({ statementId }: { statementId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(payoutAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 sm:items-end">
      <input type="hidden" name="statementId" value={statementId} />
      <div className="flex items-end gap-2">
        <TextField id={`ref-${statementId}`} name="reference" label="Payment reference" className="w-48" defaultValue={state.values?.reference} error={state.fieldErrors?.reference} />
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Recording…" : "Record payout"}
        </Button>
      </div>
      <Note state={state} />
    </form>
  );
}
