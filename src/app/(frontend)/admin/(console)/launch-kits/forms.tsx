"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/action-state";
import { approveLinkedinAction, approvePageAction, saveKitAction, startKitAction } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-callout text-negative">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="text-callout text-positive">
        {state.message}
      </p>
    );
  return null;
}

/** Starts a kit for a live product that has none. */
export function StartKitForm({ products }: { products: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startKitAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <SelectField id="slug" label="Live product" options={products.map((p) => ({ value: p.slug, label: p.name }))} className="flex-1" />
      <Button type="submit" disabled={pending}>
        Prepare a kit
      </Button>
      <Result state={state} />
    </form>
  );
}

/** The words staff edit: who it is for, the questions and the LinkedIn post. */
export function KitEditForm({ id, audience, faq, linkedinText, slots }: { id: string; audience: string; faq: { question: string; answer: string }[]; linkedinText: string; slots: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveKitAction, {});
  const shown = Math.min(slots, Math.max(faq.length + 2, 4));
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={id} />
      <TextareaField id="audience" label="Who it is for" hint="One or two sentences for the product page." defaultValue={audience} rows={3} maxLength={600} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-callout font-semibold text-ink">Questions and answers</legend>
        <p className="text-callout text-ink-muted">Leave a pair empty to drop it. Answer only from what the product includes.</p>
        {Array.from({ length: shown }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-4">
            <label htmlFor={`question-${i}`} className="text-callout font-semibold text-ink">
              Question {i + 1}
            </label>
            <input id={`question-${i}`} name={`question-${i}`} defaultValue={faq[i]?.question ?? ""} maxLength={200} className={inputClass} />
            <label htmlFor={`answer-${i}`} className="text-callout font-semibold text-ink">
              Answer {i + 1}
            </label>
            <textarea id={`answer-${i}`} name={`answer-${i}`} defaultValue={faq[i]?.answer ?? ""} rows={3} maxLength={1200} className={cn(inputClass, "h-auto min-h-20 py-2.5 leading-6")} />
          </div>
        ))}
      </fieldset>
      <TextareaField id="linkedinText" label="LinkedIn post" hint="The tracked link is added after it when you copy the post." defaultValue={linkedinText} rows={8} maxLength={3000} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** Puts the product page on the website, or takes it off. Publishers only. */
export function ApprovePageForm({ id, approved }: { id: string; approved: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approvePageAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="approve" value={approved ? "no" : "yes"} />
      <Button type="submit" variant={approved ? "secondary" : "primary"} disabled={pending} className="w-fit">
        {approved ? "Take the page off the website" : "Approve and publish the page"}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function ApproveLinkedinForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveLinkedinAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending} className="w-fit">
        Approve the post
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Copies text, and says so. */
export function CopyButton({ text, label, size = "sm" }: { text: string; label: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
