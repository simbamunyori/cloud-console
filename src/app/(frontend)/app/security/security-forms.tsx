"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { newBackupCodesAction, signOutOthersAction, type CodesState } from "./actions";

export function BackupCodesForm() {
  const [state, action, pending] = useActionState<CodesState, FormData>(newBackupCodesAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);
  if (state.codes) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="positive">New backup codes are ready. The old ones no longer work. This is the only time we show these.</Alert>
        <ul aria-label="Backup codes" className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-surface-2 p-4 font-mono text-body tracking-wider text-ink">
          {state.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="self-start"
          onClick={async () => {
            await navigator.clipboard.writeText(state.codes!.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    );
  }
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="flex flex-col gap-2">
        <span className="text-callout font-semibold text-ink">Enter the code from your authenticator app</span>
        <CodeInput key={state.attempt ?? 0} name="code" label="Six-digit code" invalid={Boolean(state.error)} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Checking…" : "Make new backup codes"}
      </Button>
    </form>
  );
}

export function SignOutOthersForm() {
  return (
    <form action={signOutOthersAction} className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-callout text-ink-muted">Signed in somewhere you don&apos;t recognise? End every other session.</span>
      <Button type="submit" variant="secondary" size="sm">
        Sign out other devices
      </Button>
    </form>
  );
}
