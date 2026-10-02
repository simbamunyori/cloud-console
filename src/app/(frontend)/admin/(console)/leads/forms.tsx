"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { setLeadStatusAction, stopFollowUpsAction } from "./actions";

/** Contacted and Closed, or back to New, for one lead. */
export function LeadStatusForm({ reference, status }: { reference: string; status: "NEW" | "CONTACTED" | "CLOSED" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setLeadStatusAction, {});
  const next = status === "NEW" ? (["CONTACTED", "CLOSED"] as const) : status === "CONTACTED" ? (["CLOSED", "NEW"] as const) : (["NEW"] as const);
  const label = { NEW: "Reopen", CONTACTED: "Mark contacted", CLOSED: "Close" } as const;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="reference" value={reference} />
      <div className="flex flex-wrap gap-2">
        {next.map((s, i) => (
          <Button key={s} type="submit" name="status" value={s} variant={i === 0 ? "primary" : "secondary"} size="sm" disabled={pending}>
            {label[s]}
          </Button>
        ))}
      </div>
      {state.error ? (
        <p role="alert" className="text-callout text-negative">
          {state.error}
        </p>
      ) : state.message ? (
        <p role="status" className="text-callout text-positive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function StopFollowUpsForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(stopFollowUpsAction, {});
  if (state.message) {
    return (
      <p role="status" className="text-callout text-positive">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          Stop the emails
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-callout text-negative">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
