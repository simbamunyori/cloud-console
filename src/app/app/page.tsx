import { ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceStatusBadge, ServiceStatusBadge } from "@/components/app/status";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMonth } from "@/lib/dates";
import { requireBilling } from "@/server/billing/context";
import { SecurityScoreCard } from "@/components/app/security-score";
import { securityFacts } from "@/server/org/security-facts";
import { securityChecks } from "@/server/org/security-score";
import { amountOwed, attentionItems, isOverdue, monthlyPrice, monthlyTotal, nextInvoice } from "@/server/billing/views";

export const metadata: Metadata = { title: "Home" };

const TONE_ICON = { negative: CircleAlert, warning: TriangleAlert, info: Info };
const TONE_CLASS = { negative: "text-negative", warning: "text-warning", info: "text-link" };

export default async function HomePage() {
  const { organisation, actor, billing, db, today, currency, locale } = await requireBilling();
  const [services, domains, invoices] = await Promise.all([billing.listServices(), billing.listDomains(), billing.listInvoices()]);

  const live = services.filter((s) => s.status !== "cancelled" && s.status !== "terminated");
  const monthly = monthlyTotal(services, currency);
  const next = nextInvoice(services, domains, currency);
  const owed = amountOwed(invoices, currency);
  const attention = attentionItems(invoices, services, domains, today, locale);
  const recent = invoices.slice(0, 3);
  const checks = securityChecks(await securityFacts(db, actor.userId, live, today));

  return (
    <>
      <PageHeader eyebrow={organisation.name} title={`Welcome, ${actor.name.split(" ")[0]}`} />
      <div className="flex flex-col gap-6">
        {/* Three totals: a compact row on phones, cards from tablet width up. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="flex min-w-0 flex-col gap-1 p-3 sm:p-5">
            <span className="text-caption text-ink-muted sm:text-callout">
              <span className="sm:hidden">This month</span>
              <span className="hidden sm:inline">Monthly total, {formatMonth(today)}</span>
            </span>
            <Amount locale={locale} value={monthly} compact size="headline" className="text-ink sm:hidden" />
            <Amount locale={locale} value={monthly} size="title-1" className="hidden text-ink sm:inline" />
            <span className="hidden text-callout text-ink-muted sm:inline">
              For {live.length} {live.length === 1 ? "service" : "services"}
            </span>
          </Card>
          <Card className="flex min-w-0 flex-col gap-1 p-3 sm:p-5">
            <span className="text-caption text-ink-muted sm:text-callout">Next invoice</span>
            {next ? (
              <>
                <span className="text-headline text-ink sm:text-title-1">{formatDay(next.dueOn, next.dueOn.getUTCFullYear() !== today.getUTCFullYear())}</span>
                <span className="hidden text-callout text-ink-muted sm:inline">
                  About <Amount locale={locale} value={next.amount} className="text-callout" /> falls due
                </span>
              </>
            ) : (
              <span className="text-headline text-ink sm:text-title-1">None due</span>
            )}
          </Card>
          <Link href="/app/billing" className="group min-w-0 rounded-lg">
            <Card className="flex h-full flex-col gap-1 p-3 group-hover:bg-surface-2 sm:p-5">
              <span className="text-caption text-ink-muted sm:text-callout">
                <span className="sm:hidden">To pay</span>
                <span className="hidden sm:inline">To pay now</span>
              </span>
              <Amount locale={locale} value={owed} compact size="headline" className={`sm:hidden ${owed.amountMinor > 0n ? "text-ink" : "text-positive"}`} />
              <Amount locale={locale} value={owed} size="title-1" className={`hidden sm:inline ${owed.amountMinor > 0n ? "text-ink" : "text-positive"}`} />
              <span className="hidden text-callout text-link group-hover:underline sm:inline">{owed.amountMinor > 0n ? "See invoices" : "All paid, thank you"}</span>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] [&>*]:min-w-0">
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
          <SecurityScoreCard checks={checks} />
        </div>

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
                  <Link href="/app/marketplace" className="text-link underline underline-offset-2">
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
                        <Amount locale={locale} value={monthlyPrice(s)} className="text-callout" /> a month
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
                      <Amount locale={locale} value={i.total} className="text-callout text-ink" />
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
