import { ArrowLeft, FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteLines, QuoteStateBadge } from "@/components/quotes/quote-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { countryName } from "@/lib/countries";
import { addDays, formatMoment, toDateOnly } from "@/lib/dates";
import { money, toPlainAmount } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { DEFAULT_VALID_DAYS, quotableProducts, quoteForStaff, quoteState, quoteTaxNote, todayForMarket } from "@/server/quotes/quotes";
import { partnerLinks } from "@/server/site/partner-links";
import { CloseQuoteForm, QuoteEditor, ReferQuoteForm } from "../forms";

export const metadata: Metadata = { title: "Quote" };

export default async function StaffQuotePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { staff } = await requireStaffCan("manageQuotes");
  const quote = await quoteForStaff(prisma, staff, reference);
  if (!quote) notFound();
  const [markets, products] = await Promise.all([prisma.market.findMany({ orderBy: { sortOrder: "asc" } }), quotableProducts(prisma)]);
  const market = markets.find((m) => m.code === quote.market)!;
  const pdfs = await featureOn(prisma, "branded-pdfs");
  const today = todayForMarket(market);
  const state = quoteState(quote, today);
  const open = quote.status === "NEW" || quote.status === "SENT";
  const order = quote.orderId ? await prisma.order.findUnique({ where: { id: quote.orderId }, select: { reference: true } }) : null;
  const tz = DEFAULT_TIME_ZONE;

  return (
    <>
      <Link href="/admin/quotes" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Quotes
      </Link>
      <PageHeader eyebrow={`Quote ${quote.reference}`} title={quote.company ?? quote.name} actions={
          <span className="flex items-center gap-3">
            <QuoteStateBadge state={state} />
            {pdfs && quote.lines.length > 0 && (
              <Button asChild variant="secondary" size="sm">
                <a href={`/admin/quotes/${encodeURIComponent(quote.reference)}/pdf`} download>
                  <FileDown aria-hidden className="size-4" />
                  Download PDF
                </a>
              </Button>
            )}
          </span>
        } />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          {quote.referTo ? (
            <Card aria-labelledby="quote-referral">
              <CardHeader
                id="quote-referral"
                title={`For ${quote.referTo}`}
                description={`${quote.referTo} carries out this work, not us. Pass the request and the contact details to them, then mark it introduced; the customer gets an email saying ${quote.referTo} will be in touch.`}
              />
              <CardBody className="flex flex-col gap-4">
                {quote.referredAt ? (
                  <p className="text-ink-body">Introduced {formatMoment(quote.referredAt, tz)}.</p>
                ) : quote.status === "NEW" ? (
                  <ReferQuoteForm reference={quote.reference} partner={quote.referTo} />
                ) : null}
                {quote.referTo === "NSMC" ? (
                  <a href={(await partnerLinks(quote.market)).nsmcUrl} className="text-callout text-link hover:underline">
                    NSMC&apos;s website
                  </a>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          {quote.referTo && !open && !quote.lines.length ? null : (
            <Card aria-labelledby="quote-edit">
              <CardHeader
                id="quote-edit"
                title={open ? "Price it" : "The quote"}
                description={open ? (quote.status === "SENT" ? "Sent. Saving a change takes it back to New and stops the emailed link working, so send it again." : "Nothing goes to the customer until you send it.") : undefined}
              />
              <CardBody className="flex flex-col gap-6">
                {open ? (
                  <QuoteEditor
                    reference={quote.reference}
                    locked={false}
                    markets={markets.map((m) => ({ value: m.code, label: `${m.name} (${m.currency})` }))}
                    products={products.map((p) => ({ value: p.id, label: `${p.name} (${p.category.name}${p.fulfilment === "QUOTE" ? ", by quote" : ""})` }))}
                    initial={{
                      market: quote.market,
                      productId: quote.productId ?? "",
                      message: quote.message ?? "",
                      validUntil: quote.validUntil ? toDateOnly(quote.validUntil) : toDateOnly(addDays(today, DEFAULT_VALID_DAYS)),
                      lines: quote.lines.map((l) => ({ kind: l.kind, description: l.description, quantity: String(l.quantity), unitPrice: toPlainAmount(money(l.unitPriceMinor, market.currency)) })),
                    }}
                  />
                ) : (
                  <>
                    {quote.message ? <p className="whitespace-pre-line text-ink-body">{quote.message}</p> : null}
                    <QuoteLines lines={quote.lines} currency={market.currency} locale={company.staffLocale} taxNote={quoteTaxNote(market)} />
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card aria-labelledby="quote-request">
            <CardHeader id="quote-request" title="The request" />
            <CardBody className="flex flex-col gap-4">
              <p className="whitespace-pre-line text-ink-body">{quote.need}</p>
              <DetailList
                items={[
                  ["Name", quote.name],
                  ...(quote.company ? ([["Company", quote.company]] as [string, string][]) : []),
                  ["Email", <span key="email" className="wrap-anywhere">{quote.email}</span>],
                  ["Phone", quote.phone ?? "None"],
                  ["Country", countryName(quote.country)],
                  ...(quote.product ? ([["Asked about", quote.product.name]] as [string, string][]) : []),
                  ["Asked", formatMoment(quote.createdAt, tz)],
                ]}
              />
              {quote.organisation ? (
                <Link href={`/admin/customers/${quote.organisation.id}`} className="text-callout text-link hover:underline">
                  {quote.organisation.name}&apos;s account
                </Link>
              ) : quote.referTo ? null : (
                <p className="text-callout text-ink-muted">Not a customer yet. They&apos;ll sign in or open an account to accept.</p>
              )}
            </CardBody>
          </Card>
          <Card aria-labelledby="quote-history">
            <CardHeader id="quote-history" title="History" />
            <CardBody className="flex flex-col gap-4">
              <DetailList
                items={[
                  ...(quote.sentAt ? ([["Sent", `${formatMoment(quote.sentAt, tz)} by ${quote.sentByName}`]] as [string, string][]) : []),
                  ...(quote.decidedAt ? ([[state === "accepted" ? "Accepted" : state === "declined" ? "Declined" : "Closed", `${formatMoment(quote.decidedAt, tz)} by ${quote.decidedByName}`]] as [string, string][]) : []),
                  ...(quote.declineReason ? ([["Reason", quote.declineReason]] as [string, string][]) : []),
                  ...(order ? ([["Order", order.reference]] as [string, string][]) : []),
                ]}
              />
              {!quote.sentAt && !quote.decidedAt ? <p className="text-callout text-ink-muted">Not sent yet.</p> : null}
              {open ? <CloseQuoteForm reference={quote.reference} /> : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
