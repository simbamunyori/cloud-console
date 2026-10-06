"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DateField, SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { requestRestoreAction } from "./actions";

/** Ask for something back from one backup. */
export function RestoreForm({ protections, destinations, today }: { protections: { value: string; label: string }[]; destinations: { value: string; label: string }[]; today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestRestoreAction, {});
  const fe = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : state.error ? <Alert>{state.error}</Alert> : state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      {protections.length > 1 ? (
        <SelectField id="protectionId" label="Backup" options={protections} defaultValue={v.protectionId ?? protections[0]?.value} error={fe.protectionId} />
      ) : (
        <input type="hidden" name="protectionId" value={protections[0]?.value ?? ""} />
      )}
      <TextareaField id="what" label="What should we restore?" defaultValue={v.what ?? ""} error={fe.what} hint="For example: Thabo's mailbox, the Finance shared folder, or the whole server." rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField id="fromDay" label="From the backup of" max={today} defaultValue={v.fromDay ?? today} error={fe.fromDay} />
        <SelectField id="destination" label="Put it" options={destinations} defaultValue={v.destination ?? "alongside"} error={fe.destination} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Ask for a restore"}
        </Button>
      </div>
    </form>
  );
}
