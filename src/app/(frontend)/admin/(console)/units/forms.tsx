"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { routeQueueAction, saveTargetsAction, setUnitsAction } from "./actions";

type Option = { value: string; label: string };

function Note({ state }: { state: ActionState }) {
  if (state.ok && state.message) return <p className="text-callout text-positive">{state.message}</p>;
  if (state.error) return <p className="text-callout text-negative">{state.error}</p>;
  return null;
}

export function MemberUnitsForm({ userId, name, current, units }: { userId: string; name: string; current: string[]; units: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setUnitsAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="sr-only">Units for {name}</legend>
        {units.map((u) => (
          <label key={u.value} className="flex items-center gap-2 text-callout text-ink">
            <input type="checkbox" name="units" value={u.value} defaultChecked={current.includes(u.value)} className="size-4" />
            {u.label}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Note state={state} />
      </div>
    </form>
  );
}

export function QueueRouteForm({ queue, label, current, units }: { queue: string; label: string; current: string; units: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(routeQueueAction, {});
  return (
    <form action={action} className="flex flex-col gap-1 sm:items-end">
      <input type="hidden" name="queue" value={queue} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`route-${queue}`}>
          Unit for {label}
        </label>
        <select id={`route-${queue}`} name="unit" defaultValue={current} className="h-10 rounded-md border border-border-strong bg-surface-1 px-3 text-callout text-ink">
          {units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Note state={state} />
    </form>
  );
}

export function TargetsForm({ unit, rows }: { unit: string; rows: { priority: string; label: string; first: number; resolve: number }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTargetsAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="unit" value={unit} />
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <fieldset key={r.priority} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-callout font-semibold text-ink">{r.label}</legend>
            <TextField id={`${unit}-${r.priority}-first`} name={`${r.priority}-first`} label="First reply (minutes)" inputMode="numeric" defaultValue={state.values?.[`${r.priority}-first`] ?? String(r.first)} error={fe[`${r.priority}-first`]} />
            <TextField id={`${unit}-${r.priority}-resolve`} name={`${r.priority}-resolve`} label="Sorted (minutes)" inputMode="numeric" defaultValue={state.values?.[`${r.priority}-resolve`] ?? String(r.resolve)} error={fe[`${r.priority}-resolve`]} />
          </fieldset>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save targets"}
        </Button>
        <Note state={state} />
      </div>
    </form>
  );
}
