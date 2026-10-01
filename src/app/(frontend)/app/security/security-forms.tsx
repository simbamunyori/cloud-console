"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { newBackupCodesAction, replaceBackupCodesAction, signOutOthersAction, unlinkAction, type CodesState, type MethodState } from "./actions";

export function BackupCodesForm({ hasCode = true }: { hasCode?: boolean }) {
  const [state, action, pending] = useActionState<CodesState, FormData>(hasCode ? newBackupCodesAction : replaceBackupCodesAction, {});
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
      {hasCode ? (
        <div className="flex flex-col gap-2">
          <span className="text-callout font-semibold text-ink">Enter the code from your authenticator app</span>
          <CodeInput key={state.attempt ?? 0} name="code" label="Six-digit code" invalid={Boolean(state.error)} />
        </div>
      ) : null}
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

export interface AccountRow {
  provider: "MICROSOFT" | "GOOGLE";
  name: string;
  slug: string;
  /** The linked account's email, or null when not connected. */
  email: string | null;
  /** Whether connecting is switched on. */
  canConnect: boolean;
}

/** Microsoft and Google accounts that sign this person in. */
export function ConnectedAccounts({ rows }: { rows: AccountRow[] }) {
  const [state, action, pending] = useActionState<MethodState, FormData>(unlinkAction, {});
  return (
    <div className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((a) => (
          <li key={a.provider} className="flex flex-wrap items-center gap-3 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/site/sign-in/${a.slug}.svg`} alt="" width={20} height={20} className="size-5" />
            <div className="flex flex-1 flex-col">
              <span className="font-semibold text-ink">{a.name}</span>
              <span className="text-callout text-ink-muted">{a.email ? `Connected as ${a.email}` : "Not connected"}</span>
            </div>
            {a.email ? (
              <form action={action}>
                <input type="hidden" name="provider" value={a.provider} />
                <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={`Disconnect ${a.name}`}>
                  Disconnect
                </Button>
              </form>
            ) : a.canConnect ? (
              <Button variant="secondary" size="sm" asChild>
                <a href={`/auth/${a.slug}/start?intent=link`} aria-label={`Connect ${a.name}`}>
                  Connect
                </a>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
