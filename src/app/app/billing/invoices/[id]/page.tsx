import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, CreditCard, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BankDetailsList } from "@/components/billing/bank-details";
import { InvoiceStatusBadge } from "@/components/app/status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { company } from "@/config/app";
import { formatDay, formatLongDate, toDateOnly } from "@/lib/dates";
import { currencySymbol, formatMoney, money, toPlainAmount } from "@/lib/domain/money";
import type { InvoiceLine, Service } from "@/server/billing/adapter";
import { requireBilling } from "@/server/billing/context";
import { poNumbers } from "@/server/billing/po";
import { compareWithPreviousMonthly, isOverdue, type LineChange } from "@/server/billing/views";
import { orderInvoiceIds } from "@/server/orders/orders";
import { can } from "@/server/org/access";
import { eftDetails } from "@/server/markets/markets";
import { isPayable } from "@/server/payments/card";
import { payByCardAction } from "../../actions";
import { EftReportForm, PoForm, PrintButton } from "./invoice-forms";

export const metadata: Metadata = { title: "Invoice" };

const KIND_TEXT: Record<InvoiceLine["kind"], string> = {
  service: "The charge for this service for the period shown.",
  domain: "Registering, transferring or renewing this domain.",
  setup: "A one-off charge to set this up.",
  prorata: "A part-period charge, from the day it started to the end of the period.",
  upgrade: "A part-period charge for a change you made, from the day of the change to the end of the period.",
  item: "A one-off charge.",
};

function ChangeChip({ change, locale }: { change?: LineChange; locale: string }) {
  if (!change || change.kind === "same") return null;
  if (change.kind === "new") {
    return (
      <span className="inline-flex items-center gap-1 text-caption font-semibold text-link">
        <Plus aria-hidden className="size-3" /> New this month
      </span>
    );
  }
  const Icon = change.kind === "up" ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 text-caption font-semibold text-ink-muted">
      <Icon aria-hidden className="size-3" /> {change.kind === "up" ? "Up" : "Down"} from {formatMoney(change.previous, locale)}
    </span>
  );
}

const CARD_MESSAGE: Record<string, { tone: "positive" | "negative" | "info"; text: string }> = {
  paid: { tone: "positive", text: "Thank you, your card payment went through. We've emailed you a receipt." },
  pending: { tone: "info", text: "The card company hasn't confirmed your payment yet. This page will show it once they do." },
  unapplied: { tone: "negative", text: "Your card was charged, but we couldn't apply it to this invoice. Our team has been told and will sort it out or refund you." },
  unavailable: { tone: "negative", text: "This invoice can't be paid by card right now. It may already be paid." },
};

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ card?: string }> }) {
  const { id } = await params;
  const { card } = await searchParams;
  const { billing, db, organisation, actor, today, market, locale } = await requireBilling();
  const invoice = await billing.getInvoice(id);
  if (!invoice) notFound();

  const [all, services, pos, eftReports, lastCard, fromOrders] = await Promise.all([
    billing.listInvoices(),
    billing.listServices(),
    poNumbers(db, [invoice.invoiceId]),
    db.eftPayment.findMany({ where: { invoiceId: invoice.invoiceId }, orderBy: { createdAt: "desc" }, take: 5 }),
    card === "failed" ? db.cardPayment.findFirst({ where: { invoiceId: invoice.invoiceId, status: "FAILED" }, orderBy: { updatedAt: "desc" } }) : null,
    orderInvoiceIds(db),
  ]);
  const comparison = await compareWithPreviousMonthly(invoice, all, (i) => billing.getInvoice(i), fromOrders);
  const serviceById = new Map<string, Service>(services.map((s) => [s.serviceId, s]));
  const po = pos.get(invoice.invoiceId) ?? "";
  const overdue = isOverdue(invoice, today);
  const paid = money(invoice.total.amountMinor - invoice.balance.amountMinor, invoice.total.currency);
  const payable = isPayable(invoice);
  const canPay = payable && can(actor, "pay");
  const bank = payable ? eftDetails(market) : null;
  const waiting = eftReports.find((r) => r.status === "AWAITING_CONFIRMATION");
  const cardMessage = card === "failed" ? { tone: "negative" as const, text: `${lastCard?.failureReason ?? "The card payment didn't go through."} Nothing was taken. You can try again or pay by bank transfer.` } : card ? CARD_MESSAGE[card] : undefined;
  const address = [organisation.addressLine1, organisation.addressLine2, organisation.city, organisation.postcode].filter(Boolean);

  return (
    <>
      <Link href="/app/billing" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline print:hidden">
        <ArrowLeft aria-hidden className="size-4" /> Billing
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-callout text-ink-muted">Invoice</span>
          <h1 className="flex flex-wrap items-center gap-3 text-title-1 text-ink tabular-nums">
            {invoice.number} <InvoiceStatusBadge status={invoice.status} overdue={overdue} />
          </h1>
        </div>
        <PrintButton />
      </div>

      <div className="flex flex-col gap-6">
        {cardMessage ? (
          <Alert tone={cardMessage.tone} className="print:hidden">
            {cardMessage.text}
          </Alert>
        ) : null}
        {waiting ? (
          <Alert tone="info" className="print:hidden">
            You told us on {formatDay(waiting.createdAt, true)} that you paid {formatMoney(money(waiting.amountMinor, waiting.currency), locale)} by bank transfer. We&apos;re checking our bank account and will email you when it&apos;s confirmed.
          </Alert>
        ) : null}
        {eftReports
          .filter((r) => r.status === "REJECTED" && !waiting && payable)
          .slice(0, 1)
          .map((r) => (
            <Alert key={r.id} tone="warning" className="print:hidden">
              We couldn&apos;t find the {formatMoney(money(r.amountMinor, r.currency), locale)} bank transfer you told us about on {formatDay(r.createdAt, true)}. Our team says: {r.staffNote}
            </Alert>
          ))}
        <Card>
          <CardBody className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="label-kicker text-ink-muted">From</span>
              <span className="font-semibold text-ink">{company.legalName}</span>
              <span className="text-callout text-ink-muted">{market.supportEmail}</span>
              {market.taxRegistrationNumber ? (
                <span className="text-callout text-ink-muted">
                  {market.taxLabel} number {market.taxRegistrationNumber}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <span className="label-kicker text-ink-muted">To</span>
              <span className="font-semibold text-ink">{organisation.name}</span>
              {address.map((line) => (
                <span key={line} className="text-callout text-ink-muted">
                  {line}
                </span>
              ))}
              {organisation.vatNumber ? <span className="text-callout text-ink-muted">VAT number {organisation.vatNumber}</span> : null}
            </div>
            <div className="sm:col-span-2">
              <DetailList
                items={[
                  ["Issued", formatLongDate(invoice.issuedOn)],
                  ["Due", <span key="d" className={overdue ? "font-semibold text-negative" : undefined}>{formatLongDate(invoice.dueOn)}</span>],
                  ...(invoice.paidOn ? ([["Paid", formatLongDate(invoice.paidOn)]] as [string, string][]) : []),
                  ...(po ? ([["Purchase order", po]] as [string, string][]) : []),
                ]}
              />
            </div>
          </CardBody>
        </Card>

        <Card aria-labelledby="lines-title">
          <CardHeader
            id="lines-title"
            title="What this invoice is for"
            description={
              comparison?.previous && comparison.difference
                ? comparison.difference.amountMinor === 0n
                  ? `The same as last month's invoice ${comparison.previous.number}. Tap a line for details.`
                  : `${formatMoney(comparison.difference, locale, { signed: true })} compared with last month's invoice ${comparison.previous.number}. Tap a line for details.`
                : "Tap a line for details."
            }
          />
          <ul className="divide-y divide-border">
            {invoice.lines.map((line) => {
              const service = line.relatedId && (line.kind === "service" || line.kind === "upgrade" || line.kind === "setup") ? serviceById.get(line.relatedId) : undefined;
              const change = comparison?.lines.get(line.lineId);
              return (
                <li key={line.lineId}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-ink">{line.description}</span>
                        <ChangeChip change={change} locale={locale} />
                      </span>
                      <Amount locale={locale} value={line.amount} className="text-ink" />
                      <ChevronDown aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180 print:hidden" />
                    </summary>
                    <div className="flex flex-col gap-3 bg-surface-2 px-5 py-4 text-callout sm:px-6">
                      <p className="text-ink-body">{KIND_TEXT[line.kind]}</p>
                      {change && change.kind !== "same" && change.kind !== "new" ? (
                        <p className="text-ink-body">
                          Last month this was {formatMoney(change.previous, locale)} ({change.previousDescription}).
                        </p>
                      ) : null}
                      {change?.kind === "new" ? <p className="text-ink-body">This wasn&apos;t on last month&apos;s invoice.</p> : null}
                      {service?.details.users?.length ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-ink">Covers {service.details.users.length} {service.details.users.length === 1 ? "person" : "people"}</span>
                          <span className="text-ink-body">{service.details.users.map((u) => u.name).join(", ")}</span>
                        </div>
                      ) : null}
                      {service ? (
                        <Link href={`/app/services/${service.serviceId}`} className="self-start text-link hover:underline print:hidden">
                          View {service.name}
                        </Link>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
            {comparison?.removed.map((r) => (
              <li key={r.description} className="flex items-start gap-3 px-5 py-3 text-callout text-ink-muted sm:px-6">
                <span className="flex-1">No longer billed: {r.description}</span>
                <span className="tabular-nums line-through">{formatMoney(r.amount, locale)}</span>
              </li>
            ))}
          </ul>
          <CardBody className="border-t border-border">
            <DetailList
              items={[
                ["Subtotal", <Amount locale={locale} key="s" value={invoice.subtotal} />],
                ...(invoice.taxRateBps > 0 || invoice.tax.amountMinor !== 0n
                  ? ([[`${market.taxLabel} at ${(invoice.taxRateBps / 100).toLocaleString(locale)}%`, <Amount locale={locale} key="t" value={invoice.tax} />]] as [string, React.ReactNode][])
                  : []),
                [<span key="tl" className="font-semibold text-ink">Total</span>, <Amount locale={locale} key="tt" value={invoice.total} size="headline" className="text-ink" />],
                ...(paid.amountMinor > 0n ? ([["Paid", <Amount locale={locale} key="p" value={paid} />]] as [string, React.ReactNode][]) : []),
                ...(invoice.status !== "cancelled" ? ([[<span key="bl" className="font-semibold text-ink">Still to pay</span>, <Amount locale={locale} key="b" value={invoice.balance} size="headline" className="text-ink" />]] as [React.ReactNode, React.ReactNode][]) : []),
              ]}
            />
          </CardBody>
        </Card>

        {invoice.payments.length ? (
          <Card aria-labelledby="payments-title">
            <CardHeader id="payments-title" title="Payments" />
            <ul className="divide-y divide-border">
              {invoice.payments.map((p) => (
                <li key={p.transactionId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
                  <span className="text-ink">{formatDay(p.date, true)}</span>
                  <span className="flex-1 text-callout text-ink-muted">
                    {p.gateway === "banktransfer" ? "Bank transfer" : "Card"}, reference {p.reference}
                  </span>
                  <Amount locale={locale} value={money(p.amountIn.amountMinor - p.amountOut.amountMinor, p.amountIn.currency)} className="text-ink" />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {canPay ? (
          <Card aria-labelledby="pay-title" className="print:hidden">
            <CardHeader id="pay-title" title={`Pay ${formatMoney(invoice.balance, locale)}`} description="By card now, or by bank transfer from your bank." />
            <CardBody className="flex flex-col gap-6">
              <form action={payByCardAction}>
                <input type="hidden" name="invoiceId" value={invoice.invoiceId} />
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  <CreditCard aria-hidden /> Pay {formatMoney(invoice.balance, locale)} by card
                </Button>
              </form>
              <div className="flex flex-col gap-4 border-t border-border pt-6">
                <h3 className="text-headline text-ink">Pay by bank transfer (EFT)</h3>
                {bank ? <BankDetailsList bank={bank} reference={invoice.number} /> : <p className="text-ink-muted">Our bank details will appear here soon. Until then, contact support to pay by EFT.</p>}
                {!waiting ? (
                  <details className="group rounded-md border border-border">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      Already paid by bank transfer? Tell us
                      <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-border px-4 py-4">
                      <EftReportForm
                        invoiceId={invoice.invoiceId}
                        amount={toPlainAmount(invoice.balance)}
                        currencySymbol={currencySymbol(invoice.balance.currency, locale)}
                        reference={invoice.number}
                        today={toDateOnly(today)}
                      />
                    </div>
                  </details>
                ) : (
                  <Alert tone="info">Thanks for telling us about your transfer. We&apos;ll email you once we see it in our bank account, usually within one working day.</Alert>
                )}
              </div>
            </CardBody>
          </Card>
        ) : null}
        {bank ? (
          <Card aria-labelledby="eft-title" className={canPay ? "hidden print:block print:break-inside-avoid" : "print:break-inside-avoid"}>
            <CardHeader id="eft-title" title="Pay by bank transfer (EFT)" description="Use the reference below so we can match your payment." />
            <CardBody>
              <BankDetailsList bank={bank} reference={invoice.number} />
            </CardBody>
          </Card>
        ) : null}

        {can(actor, "pay") && invoice.status !== "cancelled" ? (
          <Card aria-labelledby="po-title" className="print:hidden">
            <CardHeader id="po-title" title="Purchase order" />
            <CardBody>
              <PoForm invoiceId={invoice.invoiceId} current={po} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
