"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { requestResetAction, type FormState } from "../actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestResetAction, {});
  if (state.sent) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Check your email">
          If {state.values?.email} has an account, we&apos;ve sent it a link to choose a new password. The link works once, for 30 minutes.
        </AuthHeading>
        <Alert tone="info">Nothing there after a few minutes? Check your spam folder, or ask again with the address you sign in with.</Alert>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <AuthHeading title="Forgot your password?">Enter the email you sign in with and we&apos;ll send you a link to choose a new one.</AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link"}
      </Button>
      <p className="border-t border-border pt-4 text-callout text-ink-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
