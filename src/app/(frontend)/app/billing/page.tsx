import { CreditCard, FileText, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BankDetailsList } from "@/components/billing/bank-details";
import { InvoiceStatusBadge } from "@/components/app/status";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { currencyName } from "@/lib/domain/money";
import type { InvoiceStatus } from "@/server/billing/adapter";
import { requireBilling } from "@/server/billing/context";
import { poNumbers } from "@/server/billing/po";
import { amountOwed, isOverdue, nextInvoice } from "@/server/billing/views";
import { bankFor } from "@/server/company/company";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Billing" };

const FILTERS: { key: string; label: string; status?: InvoiceStatus }[] = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "To pay", status: "unpaid" },
  { key: "paid", label: "Paid", status: "paid" },
];

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.show) ?? FILTERS[0];
  const { billing, db, today, currency, market, locale } = await requireBilling();
  const [invoices, services, domains] = await Promise.all([billing.listInvoices(), billing.listServices(), billing.listDomains()]);
  const shown = filter.status ? invoices.filter((i) => i.status === filter.status) : invoices;
  const pos = await poNumbers(db, shown.map((i) => i.invoiceId));
  const owed = amountOwed(invoices, currency);
  const next = nextInvoice(services, domains, currency);
  const bank = await bankFor(prisma, market, currency);

  return (
    <>
      <PageHeader title="Billing" description={`One invoice a month for everything, in ${currencyName(currency, locale)}.`} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">To pay now</span>
            <Amount locale={locale} value={owed} size="title-1" className="text-ink" />
          </Card>
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">Next invoice</span>
            <span className="text-title-1 text-ink">{next ? formatDay(next.dueOn, true) : "None due"}</span>
          </Card>
          <nav aria-label="More billing" className="flex flex-col gap-2">
            <Link href="/app/billing/statements" className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3 text-ink shadow-elevation-1 hover:bg-surface-2">
              <FileText aria-hidden className="size-5 text-link" /> Statements
            </Link>
            <Link href="/app/billing/payment-methods" className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3 text-ink shadow-elevation-1 hover:bg-surface-2">
              <CreditCard aria-hidden className="size-5 text-link" /> Payment methods
            </Link>
          </nav>
        </div>

        <Card aria-labelledby="invoices-title">
          <CardHeader
            id="invoices-title"
            title="Invoices"
            action={
              <div className="flex gap-1 rounded-md bg-surface-2 p-1 text-callout" role="group" aria-label="Which invoices">
                {FILTERS.map((f) => (
                  <Link
                    key={f.key}
                    href={f.key === "all" ? "/app/billing" : `/app/billing?show=${f.key}`}
                    aria-current={f.key === filter.key ? "true" : undefined}
                    className="rounded-sm px-3 py-1.5 aria-[current=true]:bg-surface-1 aria-[current=true]:font-semibold aria-[current=true]:text-ink"
                  >
                    {f.label}
                  </Link>
                ))}
              </div>
            }
          />
          {shown.length === 0 ? (
            <CardBody>
              {invoices.length === 0 ? (
                <EmptyState icon={ReceiptText} title="No invoices yet">
                  Your first invoice appears here when you order something.
                </EmptyState>
              ) : (
                <p className="text-ink-muted">No invoices here.</p>
              )}
            </CardBody>
          ) : (
            <>
              <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-4 border-b border-border px-6 py-2 text-caption font-semibold text-ink-muted sm:grid">
                <span>Invoice</span>
                <span>Date</span>
                <span>Due</span>
                <span className="text-right">Total</span>
                <span className="w-28 text-right">Status</span>
              </div>
              <ul className="divide-y divide-border">
                {shown.map((i) => (
                  <li key={i.invoiceId}>
                    <Link
                      href={`/app/billing/invoices/${i.invoiceId}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:px-6"
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold text-ink tabular-nums">{i.number}</span>
                        {pos.get(i.invoiceId) ? <span className="text-caption text-ink-muted">PO {pos.get(i.invoiceId)}</span> : null}
                      </span>
                      <span className="text-callout text-ink-muted sm:text-body sm:text-ink-body">
                        <span className="sm:hidden">Issued </span>
                        {formatDay(i.issuedOn, true)}
                      </span>
                      <span className="hidden text-ink-body sm:inline">{formatDay(i.dueOn, true)}</span>
                      <Amount locale={locale} value={i.total} className="text-ink sm:text-right" />
                      <span className="flex justify-end sm:w-28">
                        <InvoiceStatusBadge status={i.status} overdue={isOverdue(i, today)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {bank ? (
          <Card aria-labelledby="eft-title">
            <CardHeader id="eft-title" title="Paying by bank transfer (EFT)" description="Use the invoice number as the reference so we can match your payment. We confirm it within one working day." />
            <CardBody>
              <BankDetailsList bank={bank} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
