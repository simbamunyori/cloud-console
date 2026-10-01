"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { PasskeyButton } from "@/components/auth/passkey-button";
import { OrDivider } from "@/components/auth/provider-buttons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { confirmCodeAction, type FormState } from "./actions";

/** The recent check: a passkey or a code from the authenticator app, then back to what the person was doing. */
export function ConfirmForm({
  next,
  hasCode,
  hasPasskey,
  audience = "CUSTOMER",
  action: serverAction = confirmCodeAction,
}: {
  next: string;
  hasCode: boolean;
  hasPasskey: boolean;
  audience?: "CUSTOMER" | "STAFF";
  action?: typeof confirmCodeAction;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="flex flex-col gap-6">
      {hasPasskey ? (
        <PasskeyButton purpose="step-up" audience={audience} next={next} variant="primary" after={hasCode ? <OrDivider>or enter a code</OrDivider> : null} className="flex flex-col gap-6">
          Confirm with a passkey
        </PasskeyButton>
      ) : null}
      {hasCode ? (
        <form ref={formRef} action={action} className="flex flex-col gap-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-2">
            <span className="text-callout font-semibold text-ink">Six-digit code from your authenticator app</span>
            <CodeInput key={state.attempt ?? 0} name="code" label="Six-digit code" invalid={Boolean(state.error)} autoFocus={!hasPasskey} onComplete={() => formRef.current?.requestSubmit()} />
          </div>
          <Button type="submit" variant={hasPasskey ? "secondary" : "primary"} size="lg" disabled={pending} className="w-full">
            {pending ? "Checking…" : "Confirm"}
          </Button>
        </form>
      ) : null}
      <Link href={next} className="self-start text-callout text-ink-muted hover:underline">
        Go back
      </Link>
    </div>
  );
}
