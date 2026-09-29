"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { resetPasswordAction, type FormState } from "../../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <AuthHeading title="Choose a new password">You&apos;ll be signed out everywhere, then sign in with the new password and your authenticator code.</AuthHeading>
      {state.error ? (
        <Alert>
          {state.error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Ask for a new link
          </Link>
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <PasswordField id="password" label="New password" autoComplete="new-password" showStrength error={state.fieldErrors?.password} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
