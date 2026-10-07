import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { QuoteStateBadge } from "@/components/quotes/quote-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { connectivityOffered } from "@/server/connectivity/connectivity";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { organisationQuotes, quoteState, quoteTotals, todayForMarket } from "@/server/quotes/quotes";

export const metadata: Metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const { db, market, locale } = await requireMember();
  const [quotes, connect] = await Promise.all([organisationQuotes(db), connectivityOffered(prisma, market.code)]);
  const today = todayForMarket(market);
  return (
    <>
      <PageHeader
        title="Quotes"
        description="Quotes you've asked for and quotes we've sent. Accepting one places the order at the quoted price."
        actions={
          <>
            {connect ? (
              <Button asChild variant="secondary">
                <Link href="/app/quotes/new?for=connect">Connect your offices</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/app/quotes/new">Ask for a quote</Link>
            </Button>
          </>
        }
      />
      <Card>
        {quotes.length === 0 ? (
          <EmptyState icon={FileText} title="No quotes yet">
            Ask for a quote for anything that isn&apos;t priced in the marketplace.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => {
              const state = quoteState(q, today);
              const { monthly, oneOff } = quoteTotals(q, market.currency);
              const priced = q.status !== "NEW" && q.lines.length > 0;
              return (
                <li key={q.id}>
                  <Link href={`/app/quotes/${q.reference}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-ink">{q.product?.name ?? q.need.split("\n")[0].slice(0, 80)}</span>
                      <span className="text-callout text-ink-muted">
                        {q.reference} · Asked {formatDay(q.createdAt, true)}
                      </span>
                    </span>
                    <span className="text-callout text-ink tabular-nums sm:text-right">
                      {priced ? (
                        <>
                          {monthly.amountMinor > 0n ? `${formatMoney(monthly, locale)} a month` : null}
                          {monthly.amountMinor > 0n && oneOff.amountMinor > 0n ? <br /> : null}
                          {oneOff.amountMinor > 0n ? `${formatMoney(oneOff, locale)} once` : null}
                        </>
                      ) : (
                        <span className="text-ink-muted">Being priced</span>
                      )}
                    </span>
                    <span className="self-start sm:self-center">
                      <QuoteStateBadge state={state} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
