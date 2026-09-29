"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { acceptInviteAction, joinWithAccountAction, type FormState } from "../../actions";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInviteAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <TextField id="email-shown" label="Email" value={email} readOnly disabled hint="The address you were invited at." />
      <TextField id="name" label="Your name" autoComplete="name" defaultValue={state.values?.name} error={fe.name} required />
      <PasswordField id="password" label="Choose a password" autoComplete="new-password" showStrength error={fe.password} />
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Creating your account…" : "Continue"}
        </Button>
        <p className="text-center text-callout text-ink-muted">Next you&apos;ll set up an authenticator app. Every account needs one.</p>
      </div>
    </form>
  );
}

export function JoinWithAccountForm({ token, organisation }: { token: string; organisation: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinWithAccountAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Joining…" : `Join ${organisation}`}
      </Button>
    </form>
  );
}
