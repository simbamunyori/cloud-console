import { ArrowLeft, FileDown } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { featureOn } from "@/server/features/features";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteLines, QuoteStateBadge, validityText } from "@/components/quotes/quote-view";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { hasLegalText, REFUNDS_CONSENT_SECTION } from "@/server/cms/legal";
import { prisma } from "@/server/db";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { organisationQuote, quoteState, quoteTaxNote, quoteTotals, todayForMarket } from "@/server/quotes/quotes";
import { AcceptQuoteForm, DeclineQuoteForm } from "../forms";

export const metadata: Metadata = { title: "Quote" };

export default async function QuotePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { db, actor, organisation, locale } = await requireMember();
  const quote = await organisationQuote(db, reference);
  if (!quote) notFound();
  const market = await prisma.market.findUniqueOrThrow({ where: { code: quote.market } });
  const pdfs = await featureOn(prisma, "branded-pdfs");
  const state = quoteState(quote, todayForMarket(market));
  const order = quote.orderId ? await db.order.findFirst({ where: { id: quote.orderId }, select: { reference: true } }) : null;
  const refunds = state === "sent" && (await hasLegalText(organisation.billingMarket, "refunds"));
  const { monthly, oneOff } = quoteTotals(quote, market.currency);
  const label = [monthly.amountMinor > 0n ? `${formatMoney(monthly, locale)} a month` : null, oneOff.amountMinor > 0n ? `${formatMoney(oneOff, locale)} once` : null].filter(Boolean).join(" and ");

  return (
    <>
      <Link href="/app/quotes" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Quotes
      </Link>
      <PageHeader eyebrow={`Quote ${quote.reference}`} title={quote.product?.name ?? "Your quote"} description={state === "new" ? undefined : validityText(quote.validUntil, state)} actions={
          <span className="flex flex-wrap items-center gap-3">
            {pdfs && quote.status !== "NEW" ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/app/quotes/${encodeURIComponent(quote.reference)}/pdf`} download>
                  <FileDown aria-hidden /> Download PDF
                </a>
              </Button>
            ) : null}
            <QuoteStateBadge state={state} />
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          {state === "new" ? (
            <Alert tone="info">We&apos;re pricing this now. We&apos;ll email you when the quote is ready, and it will show here.</Alert>
          ) : (
            <Card aria-labelledby="quote-lines">
              <CardHeader id="quote-lines" title="The quote" />
              <CardBody className="flex flex-col gap-5">
                {quote.message ? <p className="whitespace-pre-line text-ink-body">{quote.message}</p> : null}
                <QuoteLines lines={quote.lines} currency={market.currency} locale={locale} taxNote={quoteTaxNote(market)} />
              </CardBody>
            </Card>
          )}
          <Card aria-labelledby="quote-request">
            <CardHeader id="quote-request" title="What you asked for" />
            <CardBody className="flex flex-col gap-4">
              <p className="whitespace-pre-line text-ink-body">{quote.need}</p>
              <DetailList
                items={[
                  ["Asked by", <span key="by" className="wrap-anywhere">{`${quote.name}, ${quote.email}`}</span>],
                  ["Asked on", formatDay(quote.createdAt, true)],
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card aria-label="Your answer" className="self-start">
          <CardBody className="flex flex-col gap-5">
            {state === "sent" ? (
              can(actor, "order") ? (
                <>
                  {quote.product && quote.product.minTermMonths > 1 ? (
                    <Alert tone="info">A minimum term of {quote.product.minTermMonths} months applies. {quote.product.commitmentNote}</Alert>
                  ) : null}
                  <AcceptQuoteForm reference={quote.reference} total={label} refundsHref={refunds ? `/${organisation.billingMarket}/legal/refunds#${REFUNDS_CONSENT_SECTION}` : null} />
                  <DeclineQuoteForm reference={quote.reference} />
                </>
              ) : (
                <Alert tone="info">Only owners and admins can accept a quote. Ask one of them to accept it.</Alert>
              )
            ) : state === "accepted" ? (
              <p className="text-ink">
                Accepted{quote.decidedByName ? ` by ${quote.decidedByName}` : ""}.{" "}
                {order ? (
                  <Link href={`/app/orders/${order.reference}`} className="text-link underline">
                    Follow the order
                  </Link>
                ) : null}
              </p>
            ) : state === "declined" ? (
              <p className="text-ink">Declined{quote.decidedByName ? ` by ${quote.decidedByName}` : ""}. Ask for a new quote whenever you&apos;re ready.</p>
            ) : state === "expired" ? (
              <p className="text-ink">This quote has expired. Ask for a new one and we&apos;ll price it again.</p>
            ) : (
              <p className="text-ink-muted">You&apos;ll be able to accept or decline it here once it&apos;s priced.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
