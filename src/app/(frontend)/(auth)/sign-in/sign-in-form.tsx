"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { signInAction, type FormState } from "../actions";

export function SignInForm({
  consoleName,
  next,
  notice,
  action: serverAction = signInAction,
  signUp = true,
  forgot = true,
  email,
  others,
  password = true,
}: {
  consoleName: string;
  next: string;
  notice?: { tone: "info" | "negative" | "positive"; text: string };
  action?: typeof signInAction;
  /** Offer "Open an account"; off for staff. */
  signUp?: boolean;
  /** Offer "Forgot password?"; off for staff (docs/decisions.md). */
  forgot?: boolean;
  /** The email to start with, e.g. from a Microsoft or Google account waiting to be linked. */
  email?: string;
  /** The other ways in (Microsoft, Google, a passkey), shown above the email form. */
  others?: React.ReactNode;
  /** Staff only: the password form, off once staff sign in with Microsoft. */
  password?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const message = state.error ? { tone: "negative" as const, text: state.error } : notice;
  return (
    <form action={action} className="flex flex-col gap-6">
      <AuthHeading title={`Sign in to ${consoleName}`} />
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {others}
      {password ? (
        <>
          <input type="hidden" name="next" value={next} />
          <TextField id="email" label="Email" type="email" autoComplete="username" inputMode="email" required autoFocus defaultValue={state.values?.email ?? email} />
          <div className="flex flex-col gap-2">
            <PasswordField id="password" label="Password" autoComplete="current-password" />
            {forgot ? (
              <Link href="/forgot-password" className="self-end text-callout font-medium text-link underline-offset-2 hover:underline">
                Forgot password?
              </Link>
            ) : null}
          </div>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? "Checking…" : "Continue"}
          </Button>
        </>
      ) : null}
      {signUp ? (
        <p className="border-t border-border pt-4 text-callout text-ink-muted">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-link hover:underline">
            Open an account
          </Link>
        </p>
      ) : null}
    </form>
  );
}
