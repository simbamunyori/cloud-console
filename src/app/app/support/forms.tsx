"use client";

import { SendHorizontal } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { askAction, openTicketAction, replyAction } from "./actions";

export function NewTicketForm({ services, service }: { services: { value: string; label: string }[]; service?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(openTicketAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && !Object.keys(fe).length ? <Alert>{state.error}</Alert> : null}
      <TextField id="subject" label="What's it about?" maxLength={120} defaultValue={state.values?.subject} error={fe.subject} placeholder="For example: Email not arriving since this morning" />
      {services.length ? <SelectField id="service" label="Which service? (optional)" placeholder="Not about one service" options={services} defaultValue={state.values?.service ?? service ?? ""} /> : null}
      <TextareaField id="body" label="Tell us more" rows={7} maxLength={5000} defaultValue={state.values?.body} error={fe.body} hint="What happened, when, and who it affects. Never include passwords or codes." />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send to our team"}
      </Button>
    </form>
  );
}

export function ReplyForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(replyAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="reference" value={reference} />
      <TextareaField id="body" label="Reply" rows={4} maxLength={5000} defaultValue={state.ok ? "" : state.values?.body} error={state.fieldErrors?.body} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}

export function AskForm({ conversationId, disabled }: { conversationId?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(askAction, {});
  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      {state.error && !state.fieldErrors ? <Alert>{state.error}</Alert> : null}
      {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
      <label htmlFor="question" className="sr-only">
        Your question
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="question"
          name="question"
          rows={2}
          maxLength={2000}
          disabled={disabled || pending}
          defaultValue={state.values?.question}
          placeholder={conversationId ? "Ask a follow-up" : "For example: Why is this month's invoice higher?"}
          aria-invalid={state.fieldErrors?.question ? true : undefined}
          className="min-h-12 flex-1 rounded-md border border-border-strong bg-surface-1 px-3 py-2.5 text-body leading-6 text-ink placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-focus"
        />
        <Button type="submit" size="lg" disabled={disabled || pending} aria-label="Ask">
          <SendHorizontal aria-hidden />
        </Button>
      </div>
      {state.fieldErrors?.question ? <p className="text-callout text-negative">{state.fieldErrors.question}</p> : null}
      {pending ? <p className="text-callout text-ink-muted" role="status">Looking into it…</p> : null}
    </form>
  );
}
