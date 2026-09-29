"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";

type Option = { value: string; label: string };

export interface QuoteRequestState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Set once the request is in. */
  reference?: string;
}

/**
 * The short form for asking for a quote, on the public site and in the
 * console. The "website" field is a trap for bots: people never see it.
 */
export function QuoteRequestForm({
  action,
  countries,
  defaults,
  hidden,
  product,
  after,
}: {
  action: (prev: QuoteRequestState, form: FormData) => Promise<QuoteRequestState>;
  countries: Option[];
  defaults: Record<string, string>;
  hidden: Record<string, string>;
  /** The product it is about, when asked from a product. */
  product?: string;
  /** What happens next, shown once it is sent. */
  after: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<QuoteRequestState, FormData>(action, {});
  if (state.reference) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6">
        <p className="flex items-center gap-2 text-headline text-ink">
          <CheckCircle2 aria-hidden className="size-5 text-positive" /> Thanks, we&apos;ve got your request
        </p>
        <p className="text-ink-body">
          Your reference is <span className="font-semibold text-ink">{state.reference}</span>. We&apos;ve emailed you a copy. {after}
        </p>
      </div>
    );
  }
  const v = { ...defaults, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {Object.entries(hidden).map(([k, value]) => (
        <input key={k} type="hidden" name={k} value={value} />
      ))}
      {state.error ? <Alert>{state.error}</Alert> : state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : null}
      {product ? (
        <p className="text-callout text-ink-muted">
          About: <span className="font-semibold text-ink">{product}</span>
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="name" label="Your name" autoComplete="name" required defaultValue={v.name} error={fe.name} />
        <TextField id="company" label="Company (optional)" autoComplete="organization" defaultValue={v.company} error={fe.company} />
        <TextField id="email" label="Work email" type="email" autoComplete="email" inputMode="email" required defaultValue={v.email} error={fe.email} />
        <TextField id="phone" label="Phone" type="tel" autoComplete="tel" required defaultValue={v.phone} error={fe.phone} hint="In case we need to ask something." />
        <SelectField id="country" label="Country" autoComplete="country" required placeholder="Choose a country" options={countries} defaultValue={v.country ?? ""} error={fe.country} />
      </div>
      <TextareaField
        id="need"
        label="What do you need?"
        rows={5}
        maxLength={2000}
        required
        defaultValue={v.need}
        error={fe.need}
        hint="Where, for how many people or sites, and by when. Plain words are fine."
      />
      {/* People never see this; bots fill it in. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Ask for a quote"}
        </Button>
      </div>
    </form>
  );
}
