"use client";

import { Minus, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/inputs";
import { formatMoney, fromJson, times, type MoneyJson } from "@/lib/domain/money";
import type { ActionState } from "@/server/action-state";
import type { OptionSpec } from "@/server/catalogue/seed-data";
import { placeOrderAction } from "../actions";
import { StartNowField } from "../start-now";

export function OrderForm({
  slug,
  unitPrice,
  unitLabel,
  quantityAllowed,
  minQuantity,
  maxQuantity,
  options,
  locale,
  refundsHref,
}: {
  slug: string;
  unitPrice: MoneyJson;
  unitLabel: string;
  quantityAllowed: boolean;
  minQuantity: number;
  maxQuantity: number;
  options: OptionSpec[];
  locale: string;
  /** Set when the market has a refunds policy: the customer confirms the service may start now. */
  refundsHref: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(placeOrderAction, {});
  const [quantity, setQuantity] = useState(Math.max(minQuantity, Number(state.values?.quantity) || (quantityAllowed ? 5 : 1)));
  const clamp = (n: number) => Math.min(maxQuantity, Math.max(minQuantity, Math.round(n) || minQuantity));
  const total = times(fromJson(unitPrice), quantity);
  const fe = state.fieldErrors ?? {};
  const noun = unitLabel.replace(/^per /, "");

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && !Object.keys(fe).length ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="slug" value={slug} />
      {quantityAllowed ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="quantity" className="text-callout font-semibold text-ink">
            How many {noun}s?
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="lg" aria-label={`One fewer ${noun}`} onClick={() => setQuantity((q) => clamp(q - 1))} disabled={quantity <= minQuantity}>
              <Minus aria-hidden />
            </Button>
            <input
              id="quantity"
              name="quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(clamp(Number(e.target.value.replace(/\D/g, ""))))}
              aria-invalid={fe.quantity ? true : undefined}
              aria-describedby={fe.quantity ? "quantity-error" : undefined}
              className="h-12 w-24 rounded-md border border-border-strong bg-surface-1 text-center text-headline text-ink tabular-nums"
            />
            <Button type="button" variant="secondary" size="lg" aria-label={`One more ${noun}`} onClick={() => setQuantity((q) => clamp(q + 1))} disabled={quantity >= maxQuantity}>
              <Plus aria-hidden />
            </Button>
          </div>
          {fe.quantity ? (
            <p id="quantity-error" className="text-callout text-negative">
              {fe.quantity}
            </p>
          ) : null}
        </div>
      ) : (
        <input type="hidden" name="quantity" value="1" />
      )}

      {options.map((o) =>
        o.type === "select" ? (
          <SelectField
            key={o.key}
            id={`option_${o.key}`}
            label={o.label}
            hint={o.hint}
            placeholder="Choose one"
            defaultValue={state.values?.[`option_${o.key}`] ?? ""}
            options={(o.choices ?? []).map((c) => ({ value: c, label: c }))}
            error={fe[`option_${o.key}`]}
          />
        ) : (
          <TextField
            key={o.key}
            id={`option_${o.key}`}
            label={o.label}
            hint={o.hint}
            defaultValue={state.values?.[`option_${o.key}`] ?? ""}
            autoCapitalize={o.format === "domain" ? "none" : undefined}
            spellCheck={o.format === "domain" ? false : undefined}
            placeholder={o.format === "domain" ? "yourcompany.co.bw" : undefined}
            error={fe[`option_${o.key}`]}
          />
        ),
      )}

      <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-4">
        <span className="text-callout text-ink-muted">
          {quantityAllowed ? `${quantity} x ${formatMoney(fromJson(unitPrice), locale)}` : "Price"}
        </span>
        <span className="text-title-2 text-ink tabular-nums">{formatMoney(total, locale)} a month</span>
        <span className="text-callout text-ink-muted">The first month is invoiced now. You can pay it by card or bank transfer.</span>
      </div>

      {refundsHref ? <StartNowField id="startNow" refundsHref={refundsHref} error={fe.startNow} /> : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Placing your order…" : `Order for ${formatMoney(total, locale)} a month`}
      </Button>
    </form>
  );
}
