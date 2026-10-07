"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { applyAction, payoutDetailsAction } from "./actions";

export function ApplyForm({ market, kinds, consent, privacyHref }: { market: string; kinds: { value: string; label: string }[]; consent: string; privacyHref: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyAction, {});
  const fe = state.fieldErrors ?? {};
  if (state.ok) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-6">
        <p className="flex items-center gap-2 text-headline text-ink">
          <CheckCircle2 aria-hidden className="size-5 text-positive" /> Application sent
        </p>
        <p className="text-body text-ink-body">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6">
      <input type="hidden" name="market" value={market} />
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="name" label="Your name" autoComplete="name" required defaultValue={state.values?.name} error={fe.name} />
        <TextField id="company" label="Your firm" autoComplete="organization" required defaultValue={state.values?.company} error={fe.company} />
        <TextField id="email" label="Work email" type="email" inputMode="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email} />
        <TextField id="phone" label="Phone (optional)" type="tel" autoComplete="tel" defaultValue={state.values?.phone} error={fe.phone} />
      </div>
      <SelectField id="kind" label="What your firm does" defaultValue={state.values?.kind ?? ""} placeholder="Choose one" options={kinds} error={fe.kind} />
      {/* People never see this; bots fill it in. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="apply-website">Leave this empty</label>
        <input id="apply-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2.5 text-callout text-ink-body">
          <input type="checkbox" name="consent" value="yes" className="mt-0.5 size-4 shrink-0 accent-brand" aria-invalid={Boolean(fe.consent) || undefined} />
          <span>
            {consent} See our{" "}
            <Link href={privacyHref} className="text-link underline underline-offset-2">
              Privacy notice
            </Link>
            .
          </span>
        </label>
        {fe.consent ? <p className="text-callout text-negative">{fe.consent}</p> : null}
      </div>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Apply"}
        </Button>
      </div>
    </form>
  );
}

export function PayoutDetailsForm({ market, token, saved }: { market: string; token: string; saved: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(payoutDetailsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="token" value={token} />
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <TextareaField
        id="details"
        label={saved ? "Replace your bank details" : "Your bank details"}
        rows={4}
        hint={saved ? "We have your details. For your safety they aren't shown here; enter them again to change them." : "Bank, branch, account name and account number."}
        error={state.fieldErrors?.details ?? (state.error && state.fieldErrors ? state.error : undefined)}
      />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save bank details"}
      </Button>
    </form>
  );
}
