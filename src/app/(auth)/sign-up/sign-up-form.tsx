"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { signUpAction, type FormState } from "../actions";

export function SignUpForm({ consoleName }: { consoleName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <AuthHeading eyebrow="Step 1 of 2" title="Open an account">
        One account for your organisation&apos;s cloud services. You can invite your team once you&apos;re in.
      </AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <TextField
        id="organisation"
        label="Organisation name"
        autoComplete="organization"
        required
        defaultValue={state.values?.organisation}
        error={fe.organisation}
        hint="Your business, school or institution, as it appears on invoices."
      />
      <TextField id="name" label="Your name" autoComplete="name" required defaultValue={state.values?.name} error={fe.name} />
      <TextField
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={fe.email}
      />
      <PasswordField id="password" label="Password" autoComplete="new-password" showStrength error={fe.password} />
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Opening your account…" : "Continue"}
        </Button>
        <p className="text-center text-callout text-ink-muted">
          Next you&apos;ll set up an authenticator app. Every account needs one.
        </p>
      </div>
      <p className="border-t border-border pt-4 text-[14px] leading-5 text-ink-muted">
        Already use {consoleName}?{" "}
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
