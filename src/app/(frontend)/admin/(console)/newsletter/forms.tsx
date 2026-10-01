"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { prepareIssuesAction, refreshIssueAction, saveIssueAction, sendIssueAction } from "./actions";

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

export function PrepareForm() {
  const [state, action, pending] = useActionState<ActionState>(prepareIssuesAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        Prepare last month&apos;s issues now
      </Button>
      <Result state={state} />
    </form>
  );
}

export function IssueForm({ id, subject, intro }: { id: string; subject: string; intro: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveIssueAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <TextField id="subject" name="subject" label="Subject line" defaultValue={state.values?.subject ?? subject} maxLength={120} required error={state.fieldErrors?.subject} />
      <TextareaField id="intro" label="Opening words" hint="Shown above the articles." defaultValue={state.values?.intro ?? intro} rows={4} maxLength={800} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function RefreshIssueForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(refreshIssueAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-fit">
        Read the month&apos;s articles again
      </Button>
      <Result state={state} />
    </form>
  );
}

export function SendIssueForm({ id, subscribers }: { id: string; subscribers: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendIssueAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Send this issue to ${subscribers} ${subscribers === 1 ? "subscriber" : "subscribers"}? It can't be unsent.`)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending || subscribers === 0} className="w-fit">
        Send to {subscribers} {subscribers === 1 ? "subscriber" : "subscribers"}
      </Button>
      <Result state={state} />
    </form>
  );
}
