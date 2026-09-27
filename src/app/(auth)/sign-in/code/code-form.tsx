"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { TextField } from "@/components/ui/field";
import { codeAction, type FormState } from "../../actions";

export function CodeForm({
  consoleName,
  email,
  next,
  action: serverAction = codeAction,
  signInPath = "/sign-in",
}: {
  consoleName: string;
  email: string;
  next: string;
  action?: typeof codeAction;
  signInPath?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const [useBackup, setUseBackup] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <AuthHeading title={useBackup ? "Use a backup code" : "Enter your code"}>
        {useBackup
          ? "Enter one of the backup codes you saved when you set up your authenticator. Each works once."
          : `Open your authenticator app and enter the six-digit code for ${consoleName} (${email}).`}
      </AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
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
      ) : (
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
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Sign in"}
      </Button>
      <div className="flex flex-col gap-2 border-t border-border pt-4 text-callout">
        <button type="button" onClick={() => setUseBackup((v) => !v)} className="self-start font-medium text-link hover:underline">
          {useBackup ? "Use the code from my app" : "I don't have my phone"}
        </button>
        <Link href={signInPath} className="self-start text-ink-muted hover:underline">
          Sign in as someone else
        </Link>
      </div>
    </form>
  );
}
