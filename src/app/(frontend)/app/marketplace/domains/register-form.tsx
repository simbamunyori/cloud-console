"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney, fromJson, times, type MoneyJson } from "@/lib/domain/money";
import type { ActionState } from "@/server/action-state";
import { registerDomainAction } from "../actions";
import { StartNowField } from "../start-now";

export function RegisterDomainForm({ domain, price, locale, refundsHref }: { domain: string; price: MoneyJson; locale: string; refundsHref: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerDomainAction, {});
  const yearly = fromJson(price);
  return (
    <form action={action} className="flex flex-col gap-2 sm:items-end">
      {state.error && !state.fieldErrors?.startNow ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="domain" value={domain} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`years-${domain}`}>
          Years for {domain}
        </label>
        <select id={`years-${domain}`} name="years" defaultValue="1" className="h-10 rounded-md border border-border-strong bg-surface-1 px-3 text-callout text-ink">
          {[1, 2, 3, 5].map((y) => (
            <option key={y} value={y}>
              {y} {y === 1 ? "year" : "years"}, {formatMoney(times(yearly, y), locale)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending}>
          {pending ? "Ordering…" : "Register"}
        </Button>
      </div>
      {refundsHref ? <StartNowField id={`startNow-${domain}`} refundsHref={refundsHref} error={state.fieldErrors?.startNow} /> : null}
    </form>
  );
}
