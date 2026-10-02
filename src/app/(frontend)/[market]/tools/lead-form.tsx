"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";

/**
 * "Email me this" under a free tool's result: an address and a consent
 * tick. The tool's inputs ride along as hidden fields, and the server
 * works the result out again rather than trusting what the page sent.
 */
export function ToolLeadForm({
  action,
  hidden,
  heading,
  text,
  button,
  consent,
  privacyHref,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  hidden: [string, string][];
  heading: string;
  text: string;
  button: string;
  consent: string;
  privacyHref: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const id = useId();
  const fe = state.fieldErrors ?? {};
  if (state.ok) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-6">
        <p className="flex items-center gap-2 text-headline text-ink">
          <CheckCircle2 aria-hidden className="size-5 text-positive" /> Sent
        </p>
        <p className="text-body text-ink-body">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={formAction} noValidate aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6">
      {hidden.map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-headline text-ink">
          {heading}
        </h2>
        <p className="text-callout text-ink-muted">{text}</p>
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={`${id}-name`} name="name" label="Your name (optional)" autoComplete="name" defaultValue={state.values?.name} error={fe.name} />
        <TextField id={`${id}-email`} name="email" label="Work email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={fe.email} />
      </div>
      {/* People never see this; bots fill it in. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Leave this empty</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2.5 text-callout text-ink-body">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            className="mt-0.5 size-4 shrink-0 accent-brand"
            aria-invalid={Boolean(fe.consent) || undefined}
            aria-describedby={fe.consent ? `${id}-consent-error` : undefined}
          />
          <span>
            {consent} See our{" "}
            <Link href={privacyHref} className="text-link underline underline-offset-2">
              Privacy notice
            </Link>
            .
          </span>
        </label>
        {fe.consent ? (
          <p id={`${id}-consent-error`} className="text-callout text-negative">
            {fe.consent}
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : button}
        </Button>
      </div>
    </form>
  );
}
