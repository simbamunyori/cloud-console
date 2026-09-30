"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DateField, SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { bookMigrationAction, checkDnsAction, tickAction, transferAction } from "./actions";

function Messages({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  return null;
}

export function CheckDnsButton({ onboardingId }: { onboardingId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(checkDnsAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Checking…" : "Check now"}
      </Button>
      <Messages state={state} />
    </form>
  );
}

const TIMES = [
  { value: "08:00", label: "8:00 in the morning" },
  { value: "12:00", label: "12:00 midday" },
  { value: "17:00", label: "17:00, after work" },
  { value: "20:00", label: "20:00 in the evening" },
];

export function BookMigrationForm({ onboardingId, sources, earliest, booked }: { onboardingId: string; sources: readonly string[]; earliest: string; booked: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(bookMigrationAction, {});
  const [open, setOpen] = useState(!booked);
  const fe = state.fieldErrors ?? {};
  const id = (k: string) => `${k}-${onboardingId}`;
  if (!open && !state.error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Messages state={state} />
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change the date
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DateField id={id("day")} name="day" label="Day" min={earliest} defaultValue={state.values?.day ?? earliest} error={fe.startsAt} />
        <SelectField id={id("time")} name="time" label="Starting at" defaultValue={state.values?.time ?? "17:00"} options={TIMES} />
        <SelectField id={id("source")} name="source" label="Where your email is now" defaultValue={state.values?.source ?? sources[0]} options={sources.map((s) => ({ value: s, label: s }))} error={fe.source} />
      </div>
      <TextareaField id={id("notes")} name="notes" label="Anything we should know" hint="Optional. For example, shared mailboxes or people away that week." rows={3} defaultValue={state.values?.notes} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Booking…" : "Book the move"}
      </Button>
    </form>
  );
}

export function ChecklistToggle({ onboardingId, itemKey, done, label }: { onboardingId: string; itemKey: string; done: boolean; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(tickAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <input type="hidden" name="key" value={itemKey} />
      <input type="hidden" name="done" value={done ? "no" : "yes"} />
      <Button type="submit" size="sm" variant={done ? "ghost" : "secondary"} disabled={pending} aria-label={done ? `Mark "${label}" as not done` : `Mark "${label}" as done`}>
        {done ? "Undo" : "Mark done"}
      </Button>
      {state.error ? <span className="text-caption text-negative">{state.error}</span> : null}
    </form>
  );
}

export function TransferForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(transferAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_2fr_1fr]">
        <SelectField
          id="vendor"
          label="What you use"
          defaultValue={state.values?.vendor ?? "MICROSOFT"}
          options={[
            { value: "MICROSOFT", label: "Microsoft 365" },
            { value: "GOOGLE", label: "Google Workspace" },
          ]}
          error={fe.vendor}
        />
        <TextField id="domain" label="Your email domain" placeholder="yourcompany.co.bw" autoComplete="off" defaultValue={state.values?.domain} error={fe.domain} />
        <TextField id="people" label="About how many people" inputMode="numeric" autoComplete="off" defaultValue={state.values?.people} error={fe.people} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Bring it across"}
      </Button>
    </form>
  );
}
