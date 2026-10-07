"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { addPersonAction, changeLicenceAction, requestConsentAction } from "./actions";

type LicenceOption = { id: string; name: string; free: number };

/** Close a dialog once its form succeeds. */
function useCloseOnSuccess(state: ActionState, close: () => void) {
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) close();
  }
}

/**
 * One person's licences: give or take back each one, or remove the person.
 * Each button sends one change.
 */
export function PersonActions({ tenantUserId, name, held, licences }: { tenantUserId: string; name: string; held: string[]; licences: LicenceOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(changeLicenceAction, {});
  useCloseOnSuccess(state, () => setOpen(false));
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Manage
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`${name}'s licences`}>
        <form action={action} className="flex flex-col gap-5">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="tenantUserId" value={tenantUserId} />
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {licences.map((l) => {
              const has = held.includes(l.id);
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-ink">{l.name}</span>
                    <span className="text-callout text-ink-muted">{has ? "Has this licence" : l.free > 0 ? `${l.free} free` : "None free"}</span>
                  </span>
                  {has ? (
                    <Button type="submit" name="intent" value={`take:${l.id}`} size="sm" variant="secondary" disabled={pending}>
                      Take back
                    </Button>
                  ) : (
                    <Button type="submit" name="intent" value={`give:${l.id}`} size="sm" disabled={pending || l.free <= 0}>
                      Give
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-callout text-ink-muted">Someone leaving? Removing them blocks their sign-in and frees every licence they hold. Their mailbox and files are kept.</p>
            <Button type="submit" name="intent" value="remove" variant="destructive" disabled={pending} className="self-start">
              Remove {name}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AddPerson({ tenantId, domain, licences }: { tenantId: string; domain: string; licences: LicenceOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(addPersonAction, {});
  useCloseOnSuccess(state, () => setOpen(false));
  const fe = state.fieldErrors ?? {};
  const firstFree = licences.find((l) => l.free > 0)?.id ?? "";
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Add a person
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Add someone to ${domain}`} description="They get a mailbox and sign-in. We send their first password to you, never to them by email.">
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="tenantId" value={tenantId} />
          <TextField id="name" label="Name" autoComplete="off" required defaultValue={state.values?.name} error={fe.name} />
          <TextField id="email" label="Email" type="email" inputMode="email" autoComplete="off" placeholder={`name@${domain}`} required defaultValue={state.values?.email} error={fe.email} />
          <SelectField
            id="licenceId"
            label="Licence"
            defaultValue={state.values?.licenceId ?? firstFree}
            options={[...licences.map((l) => ({ value: l.id, label: `${l.name} (${l.free > 0 ? `${l.free} free` : "none free"})` })), { value: "", label: "No licence for now" }]}
            error={fe.licenceId}
          />
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}

/** Asks for the link that gives us admin access to the tenant (U6). */
export function ConsentButton({ tenantId, again }: { tenantId: string; again: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestConsentAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <Button type="submit" variant={again ? "secondary" : "primary"} disabled={pending}>
        {pending ? "Getting the link…" : again ? "Get the link again" : "Give us access"}
      </Button>
    </form>
  );
}
