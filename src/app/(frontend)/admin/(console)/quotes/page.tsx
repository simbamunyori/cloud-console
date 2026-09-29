import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { QuoteStateBadge } from "@/components/quotes/quote-view";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { company } from "@/config/app";
import { countryName } from "@/lib/countries";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { quoteQueue, quoteState, quoteTotals, todayForMarket, type QuoteState } from "@/server/quotes/quotes";

export const metadata: Metadata = { title: "Quotes" };

const GROUPS: { title: string; description: string; states: QuoteState[] }[] = [
  { title: "New requests", description: "Waiting for a price. Call them if anything is unclear.", states: ["new"] },
  { title: "Sent", description: "Waiting for the customer to accept or decline.", states: ["sent"] },
  { title: "Finished", description: "Accepted, declined, expired or closed.", states: ["accepted", "declined", "expired", "closed"] },
];

export default async function QuotesQueuePage() {
  const { staff } = await requireStaffCan("manageQuotes");
  const [quotes, markets] = await Promise.all([quoteQueue(prisma, staff), prisma.market.findMany()]);
  const byCode = new Map(markets.map((m) => [m.code, m]));
  const rows = quotes.map((q) => {
    const market = byCode.get(q.market)!;
    return { q, market, state: quoteState(q, todayForMarket(market)), totals: quoteTotals(q, market.currency) };
  });
  const L = company.staffLocale;

  return (
    <>
      <PageHeader title="Quotes" description="Requests from the website and the console. Price each one with monthly and one-off lines and a date it holds until, then send it. Accepting places an ordinary order." />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No quote requests yet">
            When someone asks for a quote on the website or in the console, it appears here.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map((g) => {
            const group = rows.filter((r) => g.states.includes(r.state));
            if (!group.length) return null;
            const id = `quotes-${g.states[0]}`;
            return (
              <Card key={g.title} aria-labelledby={id}>
                <CardHeader id={id} title={`${g.title} (${group.length})`} description={g.description} />
                <ul className="divide-y divide-border">
                  {group.slice(0, 100).map(({ q, state, totals }) => (
                    <li key={q.id}>
                      <Link href={`/admin/quotes/${q.reference}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-semibold text-ink">
                            {q.company ?? q.name}
                            {q.organisation ? <span className="font-normal text-ink-muted"> (customer)</span> : null}
                          </span>
                          <span className="truncate text-callout text-ink-muted">{q.product?.name ?? q.need}</span>
                          <span className="text-caption text-ink-muted">
                            {q.reference} · {countryName(q.country)} · {q.market.toUpperCase()} · {formatDay(q.createdAt, true)}
                          </span>
                        </span>
                        {q.lines.length ? (
                          <span className="text-callout text-ink tabular-nums sm:text-right">
                            {totals.monthly.amountMinor > 0n ? <span className="block">{formatMoney(totals.monthly, L)} a month</span> : null}
                            {totals.oneOff.amountMinor > 0n ? <span className="block">{formatMoney(totals.oneOff, L)} once</span> : null}
                          </span>
                        ) : null}
                        <span className="self-start sm:self-center">
                      <QuoteStateBadge state={state} />
                    </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
