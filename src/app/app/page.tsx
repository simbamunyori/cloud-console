import { ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceStatusBadge, ServiceStatusBadge } from "@/components/app/status";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMonth } from "@/lib/dates";
import { requireBilling } from "@/server/billing/context";
import { amountOwed, attentionItems, isOverdue, monthlyPrice, monthlyTotal, nextInvoice } from "@/server/billing/views";

export const metadata: Metadata = { title: "Home" };

const TONE_ICON = { negative: CircleAlert, warning: TriangleAlert, info: Info };
const TONE_CLASS = { negative: "text-negative", warning: "text-warning", info: "text-link" };

export default async function HomePage() {
  const { organisation, actor, billing, today, currency } = await requireBilling();
  const [services, domains, invoices] = await Promise.all([billing.listServices(), billing.listDomains(), billing.listInvoices()]);

  const live = services.filter((s) => s.status !== "cancelled" && s.status !== "terminated");
  const monthly = monthlyTotal(services, currency);
  const next = nextInvoice(services, domains, currency);
  const owed = amountOwed(invoices, currency);
  const attention = attentionItems(invoices, services, domains, today);
  const recent = invoices.slice(0, 3);

  return (
    <>
      <PageHeader eyebrow={organisation.name} title={`Welcome, ${actor.name.split(" ")[0]}`} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">Monthly total, {formatMonth(today)}</span>
            <Amount value={monthly} size="title-1" className="text-ink" />
            <span className="text-callout text-ink-muted">
              For {live.length} {live.length === 1 ? "service" : "services"}
            </span>
          </Card>
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">Next invoice</span>
            {next ? (
              <>
                <span className="text-title-1 text-ink">{formatDay(next.dueOn, next.dueOn.getUTCFullYear() !== today.getUTCFullYear())}</span>
                <span className="text-callout text-ink-muted">
                  About <Amount value={next.amount} className="text-callout" /> falls due
                </span>
              </>
            ) : (
              <span className="text-title-1 text-ink">None due</span>
            )}
          </Card>
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">To pay now</span>
            <Amount value={owed} size="title-1" className={owed.amountMinor > 0n ? "text-ink" : "text-positive"} />
            <Link href="/app/billing" className="text-callout text-link hover:underline">
              {owed.amountMinor > 0n ? "See invoices" : "All paid, thank you"}
            </Link>
          </Card>
        </div>

        <Card aria-labelledby="attention-title">
          <CardHeader id="attention-title" title="Needs your attention" />
          {attention.length === 0 ? (
            <CardBody className="flex items-center gap-3">
              <CircleCheck aria-hidden className="size-5 text-positive" />
              <p className="text-ink">Nothing needs you right now.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((item) => {
                const Icon = TONE_ICON[item.tone];
                return (
                  <li key={item.key}>
                    <Link href={item.href} className="flex items-start gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
                      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${TONE_CLASS[item.tone]}`} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink">{item.title}</span>
                        <span className="text-callout text-ink-muted">{item.detail}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 text-callout text-link sm:flex">
                        {item.actionLabel} <ArrowRight aria-hidden className="size-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] [&>*]:min-w-0">
          <Card aria-labelledby="services-title">
            <CardHeader
              id="services-title"
              title="Your services"
              action={
                <Link href="/app/services" className="text-callout text-link hover:underline">
                  See all
                </Link>
              }
            />
            {live.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">
                  Nothing yet.{" "}
                  <Link href="/app/marketplace" className="text-link hover:underline">
                    Browse the marketplace
                  </Link>{" "}
                  to add your first service.
                </p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {live.map((s) => (
                  <li key={s.serviceId}>
                    <Link href={`/app/services/${s.serviceId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold text-ink">{s.name}</span>
                        <span className="truncate text-callout text-ink-muted">
                          {s.groupName}
                          {s.quantity > 1 ? `, ${s.quantity} users` : ""}
                          {s.domain ? `, ${s.domain}` : ""}
                        </span>
                      </span>
                      <span className="hidden text-callout text-ink-muted sm:inline">
                        <Amount value={monthlyPrice(s)} className="text-callout" /> a month
                      </span>
                      <ServiceStatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card aria-labelledby="invoices-title">
            <CardHeader
              id="invoices-title"
              title="Recent invoices"
              action={
                <Link href="/app/billing" className="text-callout text-link hover:underline">
                  See all
                </Link>
              }
            />
            {recent.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">No invoices yet.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((i) => (
                  <li key={i.invoiceId}>
                    <Link href={`/app/billing/invoices/${i.invoiceId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink tabular-nums">{i.number}</span>
                        <span className="text-callout text-ink-muted">{formatDay(i.issuedOn, true)}</span>
                      </span>
                      <Amount value={i.total} className="text-callout text-ink" />
                      <InvoiceStatusBadge status={i.status} overdue={isOverdue(i, today)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
