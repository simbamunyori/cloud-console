import type { QuoteLine } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { formatLongDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { QUOTE_STATE_LABEL, quoteTotals, type QuoteState } from "@/server/quotes/quotes";

const TONE: Record<QuoteState, "neutral" | "info" | "positive" | "warning" | "negative"> = {
  new: "info",
  sent: "info",
  expired: "warning",
  accepted: "positive",
  declined: "neutral",
  closed: "neutral",
};

export function QuoteStateBadge({ state }: { state: QuoteState }) {
  return <Badge tone={TONE[state]}>{QUOTE_STATE_LABEL[state]}</Badge>;
}

/**
 * A quote's lines and totals, as the customer sees it: in the console, on
 * the page its emailed link opens, and in the staff preview.
 */
export function QuoteLines({
  lines,
  currency,
  locale,
  taxNote,
}: {
  lines: Pick<QuoteLine, "id" | "kind" | "description" | "quantity" | "unitPriceMinor">[];
  currency: string;
  locale: string;
  /** e.g. "Prices exclude VAT." */
  taxNote?: string | null;
}) {
  const totals = quoteTotals({ lines }, currency);
  const show = (minor: bigint) => formatMoney(money(minor, currency), locale);
  const groups = [
    { kind: "MONTHLY" as const, title: "Every month", total: totals.monthly },
    { kind: "ONE_OFF" as const, title: "Once", total: totals.oneOff },
  ].filter((g) => lines.some((l) => l.kind === g.kind));
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.kind} aria-label={g.title} className="flex flex-col gap-2">
          <h3 className="text-callout font-semibold text-ink-muted">{g.title}</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {lines
              .filter((l) => l.kind === g.kind)
              .map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-ink">
                    {l.description}
                    {l.quantity > 1 ? (
                      <span className="block text-callout text-ink-muted">
                        {l.quantity} at {show(l.unitPriceMinor)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-ink tabular-nums">{show(l.unitPriceMinor * BigInt(l.quantity))}</span>
                </li>
              ))}
            <li className="flex items-center justify-between gap-4 bg-surface-2 px-4 py-3 font-semibold text-ink">
              <span>{g.kind === "MONTHLY" ? "Total a month" : "Total once"}</span>
              <span className="tabular-nums">{formatMoney(g.total, locale)}</span>
            </li>
          </ul>
        </section>
      ))}
      {taxNote ? <p className="text-callout text-ink-muted">{taxNote}</p> : null}
    </div>
  );
}

/** "Holds until Friday 30 October 2026", or that it has passed. */
export function validityText(validUntil: Date | null, state: QuoteState) {
  if (!validUntil) return null;
  return state === "expired" ? `This quote expired after ${formatLongDate(validUntil)}.` : `Holds until the end of ${formatLongDate(validUntil)}.`;
}
