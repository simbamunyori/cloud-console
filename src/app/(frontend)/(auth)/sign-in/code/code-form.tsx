"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { TextField } from "@/components/ui/field";
import { PasskeyButton } from "@/components/auth/passkey-button";
import { codeAction, type FormState } from "../../actions";

export function CodeForm({
  consoleName,
  email,
  next,
  action: serverAction = codeAction,
  signInPath = "/sign-in",
  audience = "CUSTOMER",
  hasCode = true,
  hasPasskey = false,
}: {
  consoleName: string;
  email: string;
  next: string;
  action?: typeof codeAction;
  signInPath?: string;
  audience?: "CUSTOMER" | "STAFF";
  /** Has an authenticator app set up. */
  hasCode?: boolean;
  hasPasskey?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const [useBackup, setUseBackup] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <AuthHeading title={useBackup ? "Use a backup code" : hasCode ? "Enter your code" : "Use your passkey"}>
        {useBackup
          ? "Enter one of the backup codes you saved when you set up two-step sign-in. Each works once."
          : hasCode
            ? `Open your authenticator app and enter the six-digit code for ${consoleName} (${email}).`
            : `Confirm it's you with the passkey on your device (${email}).`}
      </AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      {hasPasskey && !useBackup ? (
        <PasskeyButton purpose="second-step" audience={audience} next={next} variant={hasCode ? "secondary" : "primary"}>
          Use a passkey instead
        </PasskeyButton>
      ) : null}
      {useBackup ? (
        <TextField
          id="recovery"
          label="Backup code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          autoFocus
          className="font-mono"
        />
      ) : hasCode ? (
        <div className="flex flex-col gap-2">
          <span id="code-label" className="text-callout font-semibold text-ink">
            Six-digit code
          </span>
          <CodeInput
            key={state.attempt ?? 0}
            name="code"
            label="Six-digit code"
            invalid={Boolean(state.error)}
            autoFocus
            onComplete={() => formRef.current?.requestSubmit()}
          />
        </div>
      ) : null}
      {useBackup || hasCode ? (
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Sign in"}
        </Button>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-border pt-4 text-callout">
        <button type="button" onClick={() => setUseBackup((v) => !v)} className="self-start font-medium text-link hover:underline">
          {useBackup ? (hasCode ? "Use the code from my app" : "Use my passkey") : hasCode ? "I don't have my phone" : "I don't have my device"}
        </button>
        <Link href={signInPath} className="self-start text-ink-muted hover:underline">
          Sign in as someone else
        </Link>
      </div>
    </form>
  );
}
