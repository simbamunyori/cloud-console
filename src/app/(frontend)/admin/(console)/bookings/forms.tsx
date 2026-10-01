"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { cancelBookingAction, saveHoursAction } from "./actions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Result({ state }: { state: ActionState }) {
  return state.error ? (
    <p role="alert" className="text-callout text-negative">
      {state.error}
    </p>
  ) : state.message ? (
    <p role="status" className="text-callout text-positive">
      {state.message}
    </p>
  ) : null;
}

/** One range a day; ticking a day opens it for bookings. */
export function HoursForm({
  hours,
  active,
  meetingUrl,
  timeZone,
  timeZones,
}: {
  hours: { day: number; from: string; to: string }[];
  active: boolean;
  meetingUrl: string;
  timeZone: string;
  timeZones: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveHoursAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex items-center gap-2.5 text-body text-ink">
        <input type="checkbox" name="active" defaultChecked={active} className="size-4 accent-brand" />I take pre-sales calls
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-callout font-semibold text-ink">Weekly hours</legend>
        {DAYS.map((name, i) => {
          const day = i + 1;
          const h = hours.find((x) => x.day === day);
          return (
            <div key={day} className="flex flex-wrap items-center gap-3">
              <label className="flex w-36 items-center gap-2 text-callout text-ink">
                <input type="checkbox" name={`day${day}`} defaultChecked={Boolean(h)} className="size-4 accent-brand" />
                {name}
              </label>
              <label className="sr-only" htmlFor={`from${day}`}>
                {name} from
              </label>
              <input
                id={`from${day}`}
                name={`from${day}`}
                type="time"
                step={1800}
                defaultValue={h?.from ?? "09:00"}
                className="h-10 rounded-sm border border-border-strong bg-surface-0 px-2 text-callout text-ink"
              />
              <span className="text-callout text-ink-muted">to</span>
              <label className="sr-only" htmlFor={`to${day}`}>
                {name} to
              </label>
              <input
                id={`to${day}`}
                name={`to${day}`}
                type="time"
                step={1800}
                defaultValue={h?.to ?? "16:00"}
                className="h-10 rounded-sm border border-border-strong bg-surface-0 px-2 text-callout text-ink"
              />
            </div>
          );
        })}
        {fe.hours ? <p className="text-callout text-negative">{fe.hours}</p> : null}
      </fieldset>
      <SelectField id="timeZone" label="Time zone of these hours" options={timeZones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))} defaultValue={timeZone} />
      <TextField
        id="meetingUrl"
        label="Your meeting link (optional)"
        type="url"
        defaultValue={meetingUrl}
        error={fe.meetingUrl}
        hint="Your Teams or Meet link, put in every invite. Without one, you phone the visitor."
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save my hours"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function CancelBookingForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelBookingAction, {});
  if (state.message) return <Result state={state} />;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="reference" value={reference} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Cancel
      </Button>
      <Result state={state} />
    </form>
  );
}
