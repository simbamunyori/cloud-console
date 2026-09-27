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
}: {
  consoleName: string;
  next: string;
  notice?: { tone: "info" | "negative" | "positive"; text: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const message = state.error ? { tone: "negative" as const, text: state.error } : notice;
  return (
    <form action={action} className="flex flex-col gap-6">
      <AuthHeading title={`Sign in to ${consoleName}`} />
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
        defaultValue={state.values?.email}
      />
      <PasswordField id="password" label="Password" autoComplete="current-password" />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
      <p className="border-t border-border pt-4 text-[14px] leading-5 text-ink-muted">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-link hover:underline">
          Open an account
        </Link>
      </p>
    </form>
  );
}
