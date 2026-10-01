"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/inputs";
import { bookCallAction, type BookingState } from "./actions";

export interface DaySlots {
  day: string;
  label: string;
  slots: { start: string; label: string }[];
}

/** Pick a day, then a half-hour, then your details. */
export function BookingForm({
  market,
  topic,
  days,
  notes,
  consent,
  privacyHref,
  timeZone,
}: {
  market: string;
  topic: string;
  days: DaySlots[];
  notes: string;
  consent: string;
  privacyHref: string;
  timeZone: string;
}) {
  const [state, action, pending] = useActionState<BookingState, FormData>(bookCallAction, {});
  const chosen = state.values?.start;
  const [day, setDay] = useState(() => days.find((d) => d.slots.some((s) => s.start === chosen))?.day ?? days[0]?.day);
  const id = useId();
  const fe = state.fieldErrors ?? {};
  if (state.booked) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6 xl:p-8">
        <p className="flex items-center gap-2 text-title-2 text-ink">
          <CheckCircle2 aria-hidden className="size-6 text-positive" /> Your call is booked
        </p>
        <p className="text-body text-ink-body">
          {state.booked.when ? `${state.booked.when}, ${timeZone.replace(/_/g, " ")} time. ` : ""}We&apos;ve sent a calendar invite to {state.booked.email}. Accept it to add the call to your calendar;
          it has a link to cancel if plans change.
        </p>
        <p className="text-callout text-ink-muted">Reference {state.booked.reference}</p>
      </div>
    );
  }
  const current = days.find((d) => d.day === day) ?? days[0];
  return (
    <form action={action} noValidate className="flex flex-col gap-8">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="topic" value={topic} />
      {state.error ? <Alert>{state.error}</Alert> : state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-headline text-ink">1. Choose a day</legend>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <label
              key={d.day}
              className="flex cursor-pointer items-center gap-2 rounded-sm border border-border-strong bg-surface-0 px-3.5 py-2.5 text-callout text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <input type="radio" name="day" value={d.day} checked={d.day === current?.day} onChange={() => setDay(d.day)} className="size-4 accent-brand" />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3" aria-describedby={fe.start ? `${id}-start-error` : undefined}>
        <legend className="mb-1 text-headline text-ink">2. Choose a time</legend>
        <p className="text-callout text-ink-muted">Times are in {timeZone.replace(/_/g, " ")} time. Each call is 30 minutes.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
          {current?.slots.map((s) => (
            <label
              key={s.start}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface-0 px-3 py-2.5 text-callout text-ink tabular-nums has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <input type="radio" name="start" value={s.start} defaultChecked={s.start === chosen} required className="size-4 accent-brand" />
              {s.label}
            </label>
          ))}
        </div>
        {fe.start ? (
          <p id={`${id}-start-error`} className="text-callout text-negative">
            {fe.start}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-1 text-headline text-ink">3. Your details</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="name" label="Your name" autoComplete="name" required defaultValue={state.values?.name} error={fe.name} />
          <TextField id="company" label="Company (optional)" autoComplete="organization" defaultValue={state.values?.company} error={fe.company} />
          <TextField
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            error={fe.email}
            hint="The calendar invite goes here."
          />
          <TextField id="phone" label="Phone (optional)" type="tel" autoComplete="tel" defaultValue={state.values?.phone} error={fe.phone} hint="If you'd rather we call you." />
        </div>
        <TextareaField id="notes" label="What would you like to cover? (optional)" rows={3} maxLength={1000} defaultValue={state.values?.notes ?? notes} error={fe.notes} />
      </fieldset>

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
          {pending ? "Booking…" : "Book the call"}
        </Button>
      </div>
    </form>
  );
}
