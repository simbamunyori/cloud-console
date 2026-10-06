"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { inviteStaffAction, resendStaffInvitationAction, revokeStaffInvitationAction, setWebsiteRoleAction, updateStaffAction } from "./actions";

export function WebsiteRoleForm({ userId, name, current }: { userId: string; name: string; current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setWebsiteRoleAction, {});
  return (
    <form action={action} className="flex flex-col gap-1 sm:items-end">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`website-role-${userId}`}>
          Website role for {name}
        </label>
        <select id={`website-role-${userId}`} name="websiteRole" defaultValue={current} className="h-10 rounded-md border border-border-strong bg-surface-1 px-3 text-callout text-ink">
          <option value="NONE">No website role</option>
          <option value="EDITOR">Editor</option>
          <option value="PUBLISHER">Publisher</option>
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error ? <p className="text-callout text-negative">{state.error}</p> : state.ok ? <p className="text-callout text-positive">Saved</p> : null}
    </form>
  );
}

type RoleOption = { value: string; label: string; description: string };

export function InviteStaffForm({ roles }: { roles: RoleOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteStaffAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState("SUPPORT");
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  // Back to the default role once an invitation is sent.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setRole("SUPPORT");
  }
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        <TextField id="email" label="Work email" type="email" inputMode="email" autoComplete="off" required defaultValue={state.ok ? "" : state.values?.email} error={fe.email} />
        <SelectField
          id="staffRole"
          label="Staff role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={roles.map((r) => ({ value: r.value, label: r.label }))}
          error={fe.staffRole}
        />
        {role === "ADMIN" ? (
          <TextField id="invite-website-shown" label="Website" value="Publisher, as an Admin" readOnly disabled />
        ) : (
          <SelectField
            id="websiteRole"
            label="Website"
            defaultValue={state.ok ? "NONE" : (state.values?.websiteRole ?? "NONE")}
            options={[
              { value: "NONE", label: "No website role" },
              { value: "EDITOR", label: "Editor" },
              { value: "PUBLISHER", label: "Publisher" },
            ]}
            error={fe.websiteRole}
          />
        )}
      </div>
      <p className="text-callout text-ink-muted">{roles.find((r) => r.value === role)?.description}</p>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}

export function StaffActions({ userId, name, role, deactivated, roles }: { userId: string; name: string; role: string; deactivated: boolean; roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStaffAction, {});
  // Close once a change is saved.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {deactivated ? "Turn back on" : "Change"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={deactivated ? `Turn ${name}'s account back on` : `Change ${name}'s access`}>
        <form action={action} className="flex flex-col gap-5">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="userId" value={userId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-callout font-semibold text-ink">Staff role</legend>
            {roles.map((r) => (
              <label key={r.value} className="flex items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="radio" name="staffRole" value={r.value} defaultChecked={r.value === role} className="mt-1 accent-brand" />
                <span className="flex flex-col">
                  <span className="font-semibold text-ink">{r.label}</span>
                  <span className="text-callout text-ink-muted">{r.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {deactivated ? (
            <Button type="submit" name="intent" value="reactivate" disabled={pending} className="self-end">
              {pending ? "Saving…" : "Turn back on"}
            </Button>
          ) : (
            <div className="flex flex-wrap justify-between gap-3">
              <Button type="submit" name="intent" value="deactivate" variant="destructive" disabled={pending}>
                Deactivate
              </Button>
              <Button type="submit" name="intent" value="update" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </form>
      </Dialog>
    </>
  );
}

export function StaffInvitationActions({ invitationId }: { invitationId: string }) {
  const [resent, resend, resending] = useActionState<ActionState, FormData>(resendStaffInvitationAction, {});
  const [revoked, revoke, revoking] = useActionState<ActionState, FormData>(revokeStaffInvitationAction, {});
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
