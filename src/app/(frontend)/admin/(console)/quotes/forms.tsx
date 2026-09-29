"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { closeQuoteAction, saveQuoteAction } from "./actions";

type Option = { value: string; label: string };

export interface LineRow {
  kind: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const KINDS: Option[] = [
  { value: "MONTHLY", label: "A month" },
  { value: "ONE_OFF", label: "Once" },
];

const empty = (): LineRow => ({ kind: "MONTHLY", description: "", quantity: "1", unitPrice: "" });

export function QuoteEditor({
  reference,
  initial,
  markets,
  products,
  locked,
}: {
  reference: string;
  initial: { market: string; productId: string; message: string; validUntil: string; lines: LineRow[] };
  markets: Option[];
  products: Option[];
  /** Accepted, declined or closed: shown, not edited. */
  locked: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveQuoteAction, {});
  // Controlled, so a failed save keeps what was typed.
  const [v, setV] = useState({ market: initial.market, productId: initial.productId, message: initial.message, validUntil: initial.validUntil });
  const [lines, setLines] = useState<LineRow[]>(initial.lines.length ? initial.lines : [empty()]);
  const fe = state.fieldErrors ?? {};
  const setLine = (i: number, patch: Partial<LineRow>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="lineCount" value={lines.length} />
      {state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : state.error ? <Alert>{state.error}</Alert> : state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
      <fieldset disabled={locked} className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="market" label="Priced in" options={markets} value={v.market} onChange={(e) => setV({ ...v, market: e.target.value })} error={fe.market} hint="The market's currency is the quote's currency." />
          <SelectField
            id="productId"
            label="Ordered as"
            placeholder="Choose a product"
            options={products}
            value={v.productId}
            onChange={(e) => setV({ ...v, productId: e.target.value })}
            error={fe.productId}
            hint="Accepting places an order for this product. Add one in Catalogue if none fits."
          />
          <TextField id="validUntil" label="Holds until" type="date" value={v.validUntil} onChange={(e) => setV({ ...v, validUntil: e.target.value })} error={fe.validUntil} hint="It can be accepted until the end of this day." />
        </div>
        <TextareaField id="message" label="Note to the customer" rows={3} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} error={fe.message} hint="Optional. Shown above the prices." />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-headline text-ink">Price lines</legend>
          <p className="text-callout text-ink-muted">Monthly lines become the service&apos;s monthly price. Lines charged once go on the first invoice. Prices are before tax.</p>
          <ol className="flex flex-col gap-4">
            {lines.map((l, i) => (
              <li key={i} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-12 sm:items-start">
                <TextField className="sm:col-span-4" id={`lines.${i}.description`} label="What" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} error={fe[`lines.${i}.description`]} />
                <SelectField className="sm:col-span-3" id={`lines.${i}.kind`} label="Charged" options={KINDS} value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value })} error={fe[`lines.${i}.kind`]} />
                <TextField className="sm:col-span-2" id={`lines.${i}.quantity`} label="How many" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} error={fe[`lines.${i}.quantity`]} />
                <TextField className="sm:col-span-2" id={`lines.${i}.unitPrice`} label="Price each" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} error={fe[`lines.${i}.unitPrice`]} />
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:col-span-1 sm:mt-7"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, n) => n !== i) : [empty()]))}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
          <Button type="button" variant="secondary" className="self-start" onClick={() => setLines((ls) => [...ls, empty()])}>
            <Plus aria-hidden className="size-4" /> Add a line
          </Button>
        </fieldset>
      </fieldset>
      {locked ? null : (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="send" disabled={pending}>
            {pending ? "Saving…" : "Save and send"}
          </Button>
          <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}

export function CloseQuoteForm({ reference }: { reference: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(closeQuoteAction, {});
  if (state.ok) return <Alert tone="positive">{state.message}</Alert>;
  if (!open) {
    return (
      <Button type="button" variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        Close without a sale
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="reference" value={reference} />
      <TextareaField id="reason" label="Why?" rows={2} maxLength={500} error={state.fieldErrors?.reason} hint="For the record, e.g. a duplicate, spam, or nothing we can offer." />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Closing…" : "Close the request"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep it open
        </Button>
      </div>
    </form>
  );
}
