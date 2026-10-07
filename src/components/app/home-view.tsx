import { ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { ConsoleLink } from "@/components/app/console-link";
import { InvoiceStatusBadge, ServiceStatusBadge } from "@/components/app/status";
import { SecurityScoreCard } from "@/components/app/security-score";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMonth } from "@/lib/dates";
import type { Domain, InvoiceSummary, Service } from "@/server/billing/adapter";
import { amountOwed, isOverdue, monthlyPrice, monthlyTotal, nextInvoice, type AttentionItem } from "@/server/billing/views";
import type { SecurityCheck } from "@/server/org/security-score";

const TONE_ICON = { negative: CircleAlert, warning: TriangleAlert, info: Info };
const TONE_CLASS = { negative: "text-negative", warning: "text-warning", info: "text-link" };

export interface HomeViewProps {
  organisationName: string;
  firstName: string;
  today: Date;
  currency: string;
  locale: string;
  services: Service[];
  domains: Domain[];
  invoices: InvoiceSummary[];
  attention: AttentionItem[];
  checks: SecurityCheck[];
  /** The full security score (STRATEGY_ROLLOUT U4), when it is on. */
  fullScore?: number;
  /** The public site's picture of the console: links drawn as plain text. */
  demo?: boolean;
}

/**
 * The console's Home page from its facts: the totals, what needs
 * attention, the security score, services and recent invoices. The
 * console draws it with the organisation's own data; the public site
 * draws the same component with demo data.
 */
export function HomeView({ organisationName, firstName, today, currency, locale, services, domains, invoices, attention, checks, fullScore, demo = false }: HomeViewProps) {
  const live = services.filter((s) => s.status !== "cancelled" && s.status !== "terminated");
  const monthly = monthlyTotal(services, currency);
  const next = nextInvoice(services, domains, currency);
  const owed = amountOwed(invoices, currency);
  const recent = invoices.slice(0, 3);
  const liveDomains = domains.filter((d) => d.status === "active" || d.status === "pending" || d.status === "pending_transfer");
  const renewal = liveDomains.map((d) => d.expiresOn).sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <>
      <PageHeader eyebrow={organisationName} title={`Welcome, ${firstName}`} />
      <div className="flex flex-col gap-6">
        {/* The totals: a compact row on phones, cards from tablet width up.
            Amounts are always in full; on a very narrow phone the row scrolls
            sideways rather than shortening or cutting a figure. */}
        <div className="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-6 sm:overflow-visible">
          <Card className="flex min-w-fit flex-1 flex-col gap-1 p-3 sm:min-w-0 sm:p-5">
            <span className="text-caption text-ink-muted sm:text-callout">
              <span className="sm:hidden">This month</span>
              <span className="hidden sm:inline">Monthly total, {formatMonth(today)}</span>
            </span>
            <Amount locale={locale} value={monthly} className="text-callout font-semibold text-ink sm:hidden" />
            <Amount locale={locale} value={monthly} size="title-1" className="hidden text-ink sm:inline" />
            <span className="hidden text-callout text-ink-muted sm:inline">
              For {live.length} {live.length === 1 ? "service" : "services"}
            </span>
          </Card>
          <Card className="flex min-w-fit flex-1 flex-col gap-1 p-3 sm:min-w-0 sm:p-5">
            <span className="text-caption text-ink-muted sm:text-callout">Next invoice</span>
            {next ? (
              <>
                <span className="whitespace-nowrap text-callout font-semibold text-ink sm:text-title-1 sm:font-bold">{formatDay(next.dueOn, next.dueOn.getUTCFullYear() !== today.getUTCFullYear())}</span>
                <span className="hidden text-callout text-ink-muted sm:inline">
                  About <Amount locale={locale} value={next.amount} className="text-callout" /> falls due
                </span>
              </>
            ) : (
              <span className="whitespace-nowrap text-callout font-semibold text-ink sm:text-title-1 sm:font-bold">None due</span>
            )}
          </Card>
          <ConsoleLink demo={demo} href="/app/billing" className="group min-w-fit flex-1 rounded-lg sm:min-w-0">
            <Card className="flex h-full flex-col gap-1 p-3 group-hover:bg-surface-2 sm:p-5">
              <span className="text-caption text-ink-muted sm:text-callout">
                <span className="sm:hidden">To pay</span>
                <span className="hidden sm:inline">To pay now</span>
              </span>
              <Amount locale={locale} value={owed} className={`text-callout font-semibold sm:hidden ${owed.amountMinor > 0n ? "text-ink" : "text-positive"}`} />
              <Amount locale={locale} value={owed} size="title-1" className={`hidden sm:inline ${owed.amountMinor > 0n ? "text-ink" : "text-positive"}`} />
              <span className="hidden text-callout text-link group-hover:underline sm:inline">{owed.amountMinor > 0n ? "See invoices" : "All paid, thank you"}</span>
            </Card>
          </ConsoleLink>
          {/* Phones keep the three money figures; the domain count joins from tablet width. */}
          <ConsoleLink demo={demo} href="/app/services" className="group hidden rounded-lg sm:block">
            <Card className="flex h-full flex-col gap-1 p-5 group-hover:bg-surface-2">
              <span className="text-callout text-ink-muted">Domains</span>
              <span className="text-title-1 font-bold text-ink tabular-nums">{liveDomains.length}</span>
              <span className="text-callout text-ink-muted">
                {renewal ? `Next renewal ${formatDay(renewal, renewal.getUTCFullYear() !== today.getUTCFullYear())}` : "None registered yet"}
              </span>
            </Card>
          </ConsoleLink>
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
                      <ConsoleLink demo={demo} href={item.href} className="flex items-start gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
                        <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${TONE_CLASS[item.tone]}`} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-semibold text-ink">{item.title}</span>
                          <span className="text-callout text-ink-muted">{item.detail}</span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-1 text-callout text-link sm:flex">
                          {item.actionLabel} <ArrowRight aria-hidden className="size-4" />
                        </span>
                      </ConsoleLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <SecurityScoreCard checks={checks} demo={demo} {...(fullScore !== undefined ? { score: fullScore, href: "/app/security/score" } : {})} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] [&>*]:min-w-0">
          <Card aria-labelledby="services-title">
            <CardHeader
              id="services-title"
              title="Your services"
              action={
                <ConsoleLink demo={demo} href="/app/services" className="text-callout text-link hover:underline">
                  See all
                </ConsoleLink>
              }
            />
            {live.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">
                  Nothing yet.{" "}
                  <ConsoleLink demo={demo} href="/app/marketplace" className="text-link underline underline-offset-2">
                    Browse the marketplace
                  </ConsoleLink>{" "}
                  to add your first service.
                </p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {live.map((s) => (
                  <li key={s.serviceId}>
                    <ConsoleLink demo={demo} href={`/app/services/${s.serviceId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
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
                    </ConsoleLink>
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
                <ConsoleLink demo={demo} href="/app/billing" className="text-callout text-link hover:underline">
                  See all
                </ConsoleLink>
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
                    <ConsoleLink demo={demo} href={`/app/billing/invoices/${i.invoiceId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink tabular-nums">{i.number}</span>
                        <span className="text-callout text-ink-muted">{formatDay(i.issuedOn, true)}</span>
                      </span>
                      <Amount locale={locale} value={i.total} className="text-callout text-ink" />
                      <InvoiceStatusBadge status={i.status} overdue={isOverdue(i, today)} />
                    </ConsoleLink>
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
