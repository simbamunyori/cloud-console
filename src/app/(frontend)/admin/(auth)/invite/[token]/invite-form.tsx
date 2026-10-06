"use client";

import { useActionState } from "react";
import { staffAcceptInviteAction, type FormState } from "@/app/(frontend)/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";

export function AcceptStaffInviteForm({ token, email, withPassword }: { token: string; email: string; withPassword: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(staffAcceptInviteAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <TextField id="email-shown" label="Email" value={email} readOnly disabled hint="The address you were invited at." />
      <TextField id="name" label="Your full name" autoComplete="name" defaultValue={state.values?.name} error={fe.name} required />
      {withPassword ? <PasswordField id="password" label="Choose a password" autoComplete="new-password" showStrength error={fe.password} /> : null}
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Creating your account…" : "Continue"}
        </Button>
        <p className="text-center text-callout text-ink-muted">
          {withPassword
            ? "Next you'll set up an authenticator app. Every staff account needs one."
            : "Next you'll sign in with your Microsoft work account, then set up an authenticator app."}
        </p>
      </div>
    </form>
  );
}
