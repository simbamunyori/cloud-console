"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";

const SCORES: [number, string][] = [
  [5, "Very good"],
  [4, "Good"],
  [3, "OK"],
  [2, "Poor"],
  [1, "Very poor"],
];

/** The one-question satisfaction rating after a resolved ticket (U7), on the public link and in the console. */
export function RatingForm({ action, hidden, score, done }: { action: (prev: ActionState, form: FormData) => Promise<ActionState>; hidden: Record<string, string>; score?: number; done?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  if (state.ok) {
    return (
      <p role="status" className="text-body text-ink">
        {state.message}
      </p>
    );
  }
  const chosen = Number(state.values?.score ?? score ?? 0);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-callout font-semibold text-ink">How happy are you with our help?</legend>
        <div className="flex flex-wrap gap-2">
          {SCORES.map(([n, label]) => (
            <label key={n} className="flex cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface-1 px-3 py-2 text-callout text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="score" value={n} defaultChecked={chosen === n} required className="accent-brand" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <TextareaField id="comment" label="Anything to add? (optional)" rows={3} maxLength={1000} defaultValue={state.values?.comment} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : done ? "Change my rating" : "Send my rating"}
        </Button>
      </div>
    </form>
  );
}
