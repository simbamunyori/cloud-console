"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { acceptRatesAction, approveAllAction, approvePriceAction, approvePeriodAction, setOfferedAction } from "../actions";

const input = "h-10 w-28 rounded-md border border-border bg-surface-1 px-3 text-right text-callout text-ink tabular-nums";

/** Approve the suggestion, or type a different price first. */
export function ApproveForm({ market, item, name, amount, renew, currencySymbol, label }: { market: string; item: string; name: string; amount: string; renew?: string; currencySymbol: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approvePriceAction, {});
  const error = state.fieldErrors?.amount ?? state.fieldErrors?.renew ?? state.error;
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="item" value={item} />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-callout text-ink-muted">
          <span>{currencySymbol}</span>
          <span className="sr-only">{renew !== undefined ? `Registration price for ${name}` : `Price for ${name}`}</span>
          <input name="amount" inputMode="decimal" defaultValue={state.values?.amount ?? amount} aria-invalid={Boolean(state.fieldErrors?.amount)} className={input} />
        </label>
        {renew !== undefined ? (
          <label className="flex items-center gap-1 text-callout text-ink-muted">
            <span aria-hidden>renews</span>
            <span className="sr-only">Renewal price for {name}</span>
            <input name="renew" inputMode="decimal" defaultValue={state.values?.renew ?? renew} aria-invalid={Boolean(state.fieldErrors?.renew)} className={input} />
          </label>
        ) : null}
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Approving…" : label}
        </Button>
      </div>
      {state.ok && state.message ? <p className="text-caption text-positive">{state.message}</p> : null}
      {error ? <p className="text-caption text-negative">{error}</p> : null}
    </form>
  );
}

export function OfferedSwitch({ market, item, name, offered }: { market: string; item: string; name: string; offered: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setOfferedAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="offered" value={String(!offered)} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending} aria-label={`${offered ? "Withdraw" : "Offer"} ${name}`}>
        {offered ? "Withdraw" : "Offer"}
      </Button>
      {state.error ? <p className="text-caption text-negative">{state.error}</p> : null}
    </form>
  );
}

export function ApproveAllForm({ market, count }: { market: string; count: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveAllAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <input type="hidden" name="market" value={market} />
      <Button type="submit" disabled={pending || count === 0}>
        {pending ? "Approving…" : count ? `Approve ${count} ${count === 1 ? "suggestion" : "suggestions"}` : "All approved"}
      </Button>
      {state.ok && state.message ? <p className="text-callout text-positive">{state.message}</p> : null}
      {state.error ? <p className="text-callout text-negative">{state.error}</p> : null}
    </form>
  );
}

/** Puts a held-back Bank of Botswana table into use. */
export function AcceptRatesForm({ tableId, label }: { tableId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptRatesAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="tableId" value={tableId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending} aria-label={label}>
        {pending ? "Accepting…" : "Accept"}
      </Button>
      {state.ok && state.message ? <p className="text-caption text-positive">{state.message}</p> : null}
      {state.error ? <p className="text-caption text-negative">{state.error}</p> : null}
    </form>
  );
}

/** The one button the approval email leads to. */
export function ApprovePeriodForm({ period, label }: { period: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approvePeriodAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="period" value={period} />
      <Button type="submit" disabled={pending || state.ok}>
        {pending ? "Approving…" : label}
      </Button>
      {state.ok && state.message ? <p className="text-callout text-positive">{state.message}</p> : null}
      {state.error ? <p className="text-callout text-negative">{state.error}</p> : null}
    </form>
  );
}
