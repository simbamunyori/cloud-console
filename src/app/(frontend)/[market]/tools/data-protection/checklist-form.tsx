"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { readinessAction } from "../actions";

const ANSWERS = [
  ["yes", "Yes"],
  ["partly", "Partly"],
  ["no", "No"],
] as const;

/** The checklist: one row of answers per question. Sending it saves the result and opens it. */
export function ChecklistForm({ market, questions }: { market: string; questions: { key: string; text: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(readinessAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="market" value={market} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {questions.map((q, i) => (
          <li key={q.key} className="p-5 xl:px-8">
            <fieldset className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-8" aria-describedby={fe[q.key] ? `${q.key}-error` : undefined}>
              <legend className="contents">
                <span className="flex gap-3 text-body text-ink">
                  <span className="w-6 shrink-0 font-semibold text-ink-muted tabular-nums">{i + 1}.</span>
                  <span>{q.text}</span>
                </span>
              </legend>
              <div className="flex shrink-0 flex-col gap-1 pl-9 lg:pl-0">
                <div className="flex gap-2">
                  {ANSWERS.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-sm border border-border-strong bg-surface-0 px-3.5 py-2 text-callout text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                    >
                      <input type="radio" name={q.key} value={value} defaultChecked={state.values?.[q.key] === value} className="size-4 accent-brand" />
                      {label}
                    </label>
                  ))}
                </div>
                {fe[q.key] ? (
                  <p id={`${q.key}-error`} className="text-callout text-negative">
                    {fe[q.key]}
                  </p>
                ) : null}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Working it out…" : "See my score"}
        </Button>
      </div>
    </form>
  );
}
