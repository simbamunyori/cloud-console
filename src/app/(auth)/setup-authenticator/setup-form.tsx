"use client";

import { Check, Copy, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { confirmSetupAction, type SetupState } from "../actions";

export function SetupForm({
  consoleName,
  home = "/app",
  action: serverAction = confirmSetupAction,
  eyebrow,
  completed,
  qrSvg,
  secret,
  otpauthUri,
}: {
  consoleName: string;
  home?: string;
  action?: typeof confirmSetupAction;
  eyebrow?: string;
  completed: boolean;
  qrSvg: string;
  secret: string;
  otpauthUri: string;
}) {
  const [state, action, pending] = useActionState<SetupState, FormData>(serverAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const goToApp = completed && !state.recoveryCodes;

  useEffect(() => {
    if (goToApp) router.replace(home);
  }, [goToApp, router, home]);

  if (state.recoveryCodes) return <RecoveryCodes codes={state.recoveryCodes} consoleName={consoleName} home={home} />;
  if (goToApp) return null;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <AuthHeading eyebrow={eyebrow} title="Protect your account">
        {consoleName} asks for a six-digit code from an authenticator app each time you sign in. It keeps your
        services and invoices safe even if your password leaks.
      </AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <ol className="flex flex-col gap-6 rounded-lg border border-border bg-surface-1 p-6">
        <li className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div
            className="size-44 shrink-0 self-center rounded-md border border-border bg-white p-3 sm:self-start [&_svg]:size-full"
            role="img"
            aria-label="QR code for your authenticator app"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-ink">1. Scan this code</span>
            <span className="text-callout text-ink-muted">
              Use Google Authenticator, Microsoft Authenticator or 1Password.
            </span>
            <a href={otpauthUri} className="text-callout font-medium text-link hover:underline sm:hidden">
              On this phone? Open in your authenticator app
            </a>
            <span className="mt-1 text-callout text-ink-muted">Can&apos;t scan? Enter this key:</span>
            <CopyableKey value={secret} />
          </div>
        </li>
        <li className="flex flex-col gap-3 border-t border-border pt-6">
          <span className="font-semibold text-ink">2. Enter the code it shows</span>
          <CodeInput
            key={state.attempt ?? 0}
            name="code"
            label="Six-digit code from your app"
            invalid={Boolean(state.error)}
            onComplete={() => formRef.current?.requestSubmit()}
          />
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Checking…" : "Verify and continue"}
        </Button>
        <span className="text-callout text-ink-muted">Codes change every 30 seconds.</span>
      </div>
    </form>
  );
}

function CopyableKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="rounded-sm bg-surface-2 px-2.5 py-1.5 font-mono text-callout text-ink">{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value.replace(/\s/g, ""));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex size-8 items-center justify-center rounded-sm text-link hover:bg-surface-2"
        aria-label={copied ? "Key copied" : "Copy key"}
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      </button>
    </div>
  );
}

function RecoveryCodes({ codes, consoleName, home }: { codes: string[]; consoleName: string; home: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `${consoleName} backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Save your backup codes">
        If you lose your phone, each of these codes lets you sign in once. This is the only time we show them.
      </AuthHeading>
      <Alert tone="positive">Your authenticator is set up.</Alert>
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-1 p-6 font-mono text-body tracking-wider text-ink tabular-nums"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setSaved(true);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="secondary" asChild>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
            download="backup-codes.txt"
            onClick={() => setSaved(true)}
          >
            <Download aria-hidden />
            Download
          </a>
        </Button>
      </div>
      <label className="flex items-start gap-3 text-body text-ink">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 size-4 accent-brand"
        />
        I&apos;ve saved these codes somewhere safe
      </label>
      {saved ? (
        <Button size="lg" asChild className="self-start">
          <Link href={home}>Continue</Link>
        </Button>
      ) : (
        <Button size="lg" disabled className="self-start">
          Continue
        </Button>
      )}
    </div>
  );
}
