"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { inviteAction, resendAction, revokeAction, updateMemberAction } from "./actions";

type RoleOption = { value: string; label: string; description: string };

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField id="email" label="Email" type="email" inputMode="email" autoComplete="off" required defaultValue={state.ok ? "" : state.values?.email} error={fe.email} />
        <SelectField
          id="role"
          label="Role"
          defaultValue={state.ok ? "READ_ONLY" : (state.values?.role ?? "READ_ONLY")}
          options={roles.map((r) => ({ value: r.value, label: r.label }))}
          error={fe.role}
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}

export function MemberActions({ membershipId, name, role, roles }: { membershipId: string; name: string; role: string; roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(updateMemberAction, {});
  // Close once a change is saved.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Change
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Change ${name}'s access`}>
        <form action={action} className="flex flex-col gap-5">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="membershipId" value={membershipId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-callout font-semibold text-ink">Role</legend>
            {roles.map((r) => (
              <label key={r.value} className="flex items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="radio" name="role" value={r.value} defaultChecked={r.value === role} className="mt-1 accent-brand" />
                <span className="flex flex-col">
                  <span className="font-semibold text-ink">{r.label}</span>
                  <span className="text-callout text-ink-muted">{r.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-between gap-3">
            <Button type="submit" name="intent" value="remove" variant="destructive" disabled={pending}>
              Remove from team
            </Button>
            <Button type="submit" name="intent" value="update" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const [resent, resend, resending] = useActionState<ActionState, FormData>(resendAction, {});
  const [revoked, revoke, revoking] = useActionState<ActionState, FormData>(revokeAction, {});
  const message = resent.error ?? revoked.error ?? resent.message;
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex gap-2">
        <form action={resend}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" size="sm" variant="secondary" disabled={resending}>
            Send again
          </Button>
        </form>
        <form action={revoke}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" size="sm" variant="ghost" disabled={revoking}>
            Withdraw
          </Button>
        </form>
      </div>
      {message ? <span className="text-caption text-ink-muted" role="status">{message}</span> : null}
    </div>
  );
}
