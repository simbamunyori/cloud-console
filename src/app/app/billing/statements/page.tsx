import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { company } from "@/config/app";
import { addMonths, endOfMonth, formatDay, formatMonth, startOfMonth } from "@/lib/dates";
import { requireBilling } from "@/server/billing/context";
import { buildStatement } from "@/server/billing/views";
import { PrintButton } from "../invoices/[id]/invoice-forms";

export const metadata: Metadata = { title: "Statement" };

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
function parseMonth(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return new Date(`${value}-01T00:00:00Z`);
}

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { billing, organisation, today, currency, locale } = await requireBilling();
  const thisMonth = startOfMonth(today);
  const months = Array.from({ length: 24 }, (_, i) => addMonths(thisMonth, -i));
  let from = parseMonth(params.from) ?? addMonths(thisMonth, -2);
  let to = parseMonth(params.to) ?? thisMonth;
  if (from > to) [from, to] = [to, from];
  const statement = buildStatement(await billing.listInvoices(), await billing.listTransactions(), from, endOfMonth(to), currency);
  const select = "h-10 rounded-md border border-border-strong bg-surface-1 px-3 text-body text-ink";

  return (
    <>
      <Link href="/app/billing" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline print:hidden">
        <ArrowLeft aria-hidden className="size-4" /> Billing
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-callout text-ink-muted">{organisation.name}</span>
          <h1 className="text-title-1 text-ink">Statement</h1>
          <p className="text-body text-ink-muted">
            {formatMonth(from)}
            {monthKey(from) !== monthKey(to) ? ` to ${formatMonth(to)}` : ""}, from {company.legalName}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="flex flex-col gap-6">
        <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
          <label className="flex flex-col gap-1 text-callout text-ink">
            From
            <select name="from" defaultValue={monthKey(from)} className={select}>
              {months.map((m) => (
                <option key={monthKey(m)} value={monthKey(m)}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-callout text-ink">
            To
            <select name="to" defaultValue={monthKey(to)} className={select}>
              {months.map((m) => (
                <option key={monthKey(m)} value={monthKey(m)}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </form>

        <Card aria-labelledby="statement-title">
          <CardHeader id="statement-title" title="Account activity" description="Invoices add to what you owe; payments take it off." />
          <div className="flex items-center justify-between border-b border-border px-5 py-3 text-callout sm:px-6">
            <span className="text-ink-muted">Owed on {formatDay(statement.from, true)}</span>
            <Amount locale={locale} value={statement.opening} className="font-semibold text-ink" />
          </div>
          {statement.rows.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No invoices or payments in this period.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {statement.rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 px-5 py-3 sm:grid-cols-[7rem_1fr_8rem_8rem] sm:items-center sm:px-6">
                  <span className="text-callout text-ink-muted sm:text-body sm:text-ink-body">{formatDay(r.date, true)}</span>
                  <span className="order-first col-span-2 text-ink sm:order-none sm:col-span-1">
                    {r.kind === "invoice" && r.invoiceId ? (
                      <Link href={`/app/billing/invoices/${r.invoiceId}`} className="text-link hover:underline">
                        {r.description}
                      </Link>
                    ) : (
                      <>
                        {r.description} <span className="text-callout text-ink-muted">({r.reference})</span>
                      </>
                    )}
                  </span>
                  <span className="text-right">
                    {r.charge ? <Amount locale={locale} value={r.charge} className="text-ink" /> : null}
                    {r.payment ? <Amount locale={locale} value={{ ...r.payment, amountMinor: -r.payment.amountMinor }} className="text-positive" /> : null}
                  </span>
                  <span className="col-span-2 text-right text-callout text-ink-muted sm:col-span-1">
                    <span className="sm:hidden">Owed after: </span>
                    <Amount locale={locale} value={r.balance} className="text-callout" />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <CardBody className="border-t border-border">
            <DetailList
              items={[
                ["Invoices in this period", <Amount locale={locale} key="c" value={statement.charges} />],
                ["Payments in this period", <Amount locale={locale} key="p" value={statement.payments} />],
                [<span key="l" className="font-semibold text-ink">Owed on {formatDay(statement.to, true)}</span>, <Amount locale={locale} key="o" value={statement.closing} size="headline" className="text-ink" />],
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
