import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BankDetailsList } from "@/components/billing/bank-details";
import { InvoiceStatusBadge } from "@/components/app/status";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { company } from "@/config/app";
import { formatDay, formatLongDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import type { Invoice, InvoiceLine, InvoiceSummary, Service } from "@/server/billing/adapter";
import type { ScopedBilling } from "@/server/billing/scoped";
import { requireBilling } from "@/server/billing/context";
import { poNumbers } from "@/server/billing/po";
import { compareInvoices, invoicesBefore, isOverdue, isPeriodic, type LineChange } from "@/server/billing/views";
import { can } from "@/server/org/access";
import { bankDetails } from "@/server/payments/bank";
import { PoForm, PrintButton } from "./invoice-forms";

export const metadata: Metadata = { title: "Invoice" };

const KIND_TEXT: Record<InvoiceLine["kind"], string> = {
  service: "The charge for this service for the period shown.",
  domain: "Registering, transferring or renewing this domain.",
  setup: "A one-off charge to set this up.",
  prorata: "A part-period charge, from the day it started to the end of the period.",
  upgrade: "A part-period charge for a change you made, from the day of the change to the end of the period.",
  item: "A one-off charge.",
};

function ChangeChip({ change }: { change?: LineChange }) {
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
      <Icon aria-hidden className="size-3" /> {change.kind === "up" ? "Up" : "Down"} from {formatMoney(change.previous)}
    </span>
  );
}

/** Finds the previous monthly invoice, looking back a few invoices at most. */
async function previousMonthly(billing: ScopedBilling, all: InvoiceSummary[], current: Invoice) {
  for (const candidate of invoicesBefore(all, current).slice(0, 6)) {
    const full = await billing.getInvoice(candidate.invoiceId);
    if (full && isPeriodic(full)) return full;
  }
  return null;
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { billing, db, organisation, actor, today } = await requireBilling();
  const invoice = await billing.getInvoice(id);
  if (!invoice) notFound();

  const [all, services, pos] = await Promise.all([billing.listInvoices(), billing.listServices(), poNumbers(db, [invoice.invoiceId])]);
  const comparison = isPeriodic(invoice) ? compareInvoices(invoice, await previousMonthly(billing, all, invoice)) : null;
  const serviceById = new Map<string, Service>(services.map((s) => [s.serviceId, s]));
  const po = pos.get(invoice.invoiceId) ?? "";
  const overdue = isOverdue(invoice, today);
  const paid = money(invoice.total.amountMinor - invoice.balance.amountMinor, invoice.total.currency);
  const bank = invoice.balance.amountMinor > 0n ? bankDetails() : null;
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
        <Card>
          <CardBody className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="label-kicker text-ink-muted">From</span>
              <span className="font-semibold text-ink">{company.legalName}</span>
              <span className="text-callout text-ink-muted">{company.supportEmail}</span>
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
                  : `${formatMoney(comparison.difference, { signed: true })} compared with last month's invoice ${comparison.previous.number}. Tap a line for details.`
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
                        <ChangeChip change={change} />
                      </span>
                      <Amount value={line.amount} className="text-ink" />
                      <ChevronDown aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180 print:hidden" />
                    </summary>
                    <div className="flex flex-col gap-3 bg-surface-2 px-5 py-4 text-callout sm:px-6">
                      <p className="text-ink-body">{KIND_TEXT[line.kind]}</p>
                      {change && change.kind !== "same" && change.kind !== "new" ? (
                        <p className="text-ink-body">
                          Last month this was {formatMoney(change.previous)} ({change.previousDescription}).
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
                <span className="tabular-nums line-through">{formatMoney(r.amount)}</span>
              </li>
            ))}
          </ul>
          <CardBody className="border-t border-border">
            <DetailList
              items={[
                ["Subtotal", <Amount key="s" value={invoice.subtotal} />],
                ...(invoice.taxRateBps > 0 || invoice.tax.amountMinor !== 0n
                  ? ([[`VAT at ${(invoice.taxRateBps / 100).toLocaleString("en-GB")}%`, <Amount key="t" value={invoice.tax} />]] as [string, React.ReactNode][])
                  : []),
                [<span key="tl" className="font-semibold text-ink">Total</span>, <Amount key="tt" value={invoice.total} size="headline" className="text-ink" />],
                ...(paid.amountMinor > 0n ? ([["Paid", <Amount key="p" value={paid} />]] as [string, React.ReactNode][]) : []),
                ...(invoice.status !== "cancelled" ? ([[<span key="bl" className="font-semibold text-ink">Still to pay</span>, <Amount key="b" value={invoice.balance} size="headline" className="text-ink" />]] as [React.ReactNode, React.ReactNode][]) : []),
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
                  <Amount value={money(p.amountIn.amountMinor - p.amountOut.amountMinor, p.amountIn.currency)} className="text-ink" />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {bank ? (
          <Card aria-labelledby="eft-title" className="print:break-inside-avoid">
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
