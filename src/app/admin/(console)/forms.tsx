"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { completeTaskAction, confirmEftAction, rejectEftAction, startTaskAction } from "./actions";

type ServerAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Result({ state }: { state: ActionState }) {
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export function TaskActions({ taskId, canStart }: { taskId: string; canStart: boolean }) {
  const [started, start, starting] = useActionState<ActionState, FormData>(startTaskAction, {});
  const [done, complete, completing] = useActionState<ActionState, FormData>(completeTaskAction, {});
  if (done.ok) return <Result state={done} />;
  return (
    <div className="flex flex-col gap-3">
      <Result state={started.ok ? {} : started} />
      <Result state={done} />
      {canStart && !started.ok ? (
        <form action={start}>
          <input type="hidden" name="taskId" value={taskId} />
          <Button type="submit" variant="secondary" disabled={starting}>
            {starting ? "Taking it…" : "Take this task"}
          </Button>
        </form>
      ) : null}
      <form action={complete} className="flex flex-col gap-3">
        <input type="hidden" name="taskId" value={taskId} />
        <TextField id={`note-${taskId}`} name="note" label="Message to the customer (optional)" hint="Goes in the email that says it's ready, e.g. where to sign in." defaultValue={done.values?.note} />
        <Button type="submit" disabled={completing} className="self-start">
          {completing ? "Finishing…" : "Mark as done"}
        </Button>
      </form>
    </div>
  );
}

export function EftDecision({ eftPaymentId, reported }: { eftPaymentId: string; reported: string }) {
  const [confirmed, confirm, confirming] = useActionState<ActionState, FormData>(confirmEftAction, {});
  const [rejected, reject, rejecting] = useActionState<ActionState, FormData>(rejectEftAction, {});
  if (confirmed.ok) return <Result state={confirmed} />;
  if (rejected.ok) return <Result state={rejected} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={confirm} className="flex flex-col gap-3">
        <input type="hidden" name="eftPaymentId" value={eftPaymentId} />
        {confirmed.error && !confirmed.fieldErrors ? <Alert>{confirmed.error}</Alert> : null}
        <TextField
          id={`amount-${eftPaymentId}`}
          name="amountReceived"
          label="Amount that arrived"
          hint={`Leave empty if it's the ${reported} they told us.`}
          inputMode="decimal"
          defaultValue={confirmed.values?.amountReceived}
          error={confirmed.fieldErrors?.amountReceived}
        />
        <Button type="submit" disabled={confirming} className="self-start">
          {confirming ? "Confirming…" : "It's in the bank: confirm"}
        </Button>
      </form>
      <form action={reject} className="flex flex-col gap-3">
        <input type="hidden" name="eftPaymentId" value={eftPaymentId} />
        {rejected.error && !rejected.fieldErrors ? <Alert>{rejected.error}</Alert> : null}
        <TextField
          id={`note-${eftPaymentId}`}
          name="note"
          label="Why we can't find it"
          hint="The customer reads this, so say what they should check."
          defaultValue={rejected.values?.note}
          error={rejected.fieldErrors?.note}
        />
        <Button type="submit" variant="secondary" disabled={rejecting} className="self-start">
          {rejecting ? "Sending…" : "Can't find it"}
        </Button>
      </form>
    </div>
  );
}

export function SettingForm({
  action,
  name,
  label,
  defaultValue,
  suffix,
  hidden = {},
}: {
  action: ServerAction;
  name: string;
  label: string;
  defaultValue: string;
  suffix?: string;
  hidden?: Record<string, string>;
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(action, {});
  const id = `${name}-${Object.values(hidden).join("-") || "setting"}`;
  return (
    <form action={submit} className="flex flex-col gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex items-end gap-2">
        <TextField id={id} name={name} label={label} inputMode="decimal" defaultValue={state.values?.[name] ?? defaultValue} error={state.fieldErrors?.[name]} className="w-28" />
        {suffix ? <span className="pb-3 text-ink-muted">{suffix}</span> : null}
        <Button type="submit" variant="secondary" disabled={pending} className="h-11">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.ok && state.message ? <p className="text-callout text-positive">{state.message}</p> : null}
      {state.error && !state.fieldErrors ? <p className="text-callout text-negative">{state.error}</p> : null}
    </form>
  );
}
