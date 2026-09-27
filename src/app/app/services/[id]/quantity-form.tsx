"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney, fromJson } from "@/lib/domain/money";
import { changeQuantityAction, type QuantityState } from "./actions";

export function QuantityForm({ serviceId, current, min, max, unitLabel }: { serviceId: string; current: number; min: number; max: number; unitLabel: string }) {
  const [state, action, pending] = useActionState<QuantityState, FormData>(changeQuantityAction, {});
  const [quantity, setQuantity] = useState(String(current));
  const noun = unitLabel.replace(/^per /, "");
  const preview = state.preview && state.preview.to === Number(quantity) ? state.preview : null;
  const error = state.fieldErrors?.quantity;

  if (state.ok && state.reference) {
    return (
      <Alert tone="positive">
        {state.message}{" "}
        <Link href={`/app/orders/${state.reference}`} className="font-semibold underline">
          Follow it on order {state.reference}
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="serviceId" value={serviceId} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="new-quantity" className="text-callout font-semibold text-ink">
          How many {noun}s should it have?
        </label>
        <input
          id="new-quantity"
          name="quantity"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error ? true : undefined}
          aria-describedby="new-quantity-hint"
          className="h-12 w-28 rounded-md border border-border-strong bg-surface-1 text-center text-headline text-ink tabular-nums"
        />
        <p id="new-quantity-hint" className={`text-callout ${error ? "text-negative" : "text-ink-muted"}`}>
          {error ?? `It has ${current} now. Choose between ${min} and ${max}.`}
        </p>
      </div>

      {preview ? (
        <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-4">
          <span className="text-callout text-ink-muted">
            {preview.to} x {formatMoney(fromJson(preview.unitPrice))}
          </span>
          <span className="text-title-2 text-ink tabular-nums">{formatMoney(fromJson(preview.newRecurring))} a month from now on</span>
          <span className="text-callout text-ink-muted">
            {fromJson(preview.dueNow).amountMinor > 0n
              ? `We'll invoice ${formatMoney(fromJson(preview.dueNow))} now for the ${preview.daysLeft} days left in this period.`
              : "There's nothing extra to pay now. The lower price starts on your next invoice."}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {preview ? (
          <Button type="submit" name="intent" value="confirm" disabled={pending}>
            {pending ? "Making the change…" : `Change to ${preview.to} ${noun}s`}
          </Button>
        ) : (
          <Button type="submit" name="intent" value="preview" variant="secondary" disabled={pending || !quantity || Number(quantity) === current}>
            {pending ? "Working it out…" : "See the new price"}
          </Button>
        )}
      </div>
    </form>
  );
}
