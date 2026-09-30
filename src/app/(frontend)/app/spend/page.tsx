import { ArrowDownRight, ArrowUpRight, ChartColumn, Cloud, PiggyBank } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SpendChart, type ChartMonth } from "@/components/app/spend-chart";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { formatDay, formatMonth, toDateOnly } from "@/lib/dates";
import { currencyInfo, formatMoney, money } from "@/lib/domain/money";
import { requireBilling } from "@/server/billing/context";
import { can } from "@/server/org/access";
import { azureMonth, spendOverview } from "@/server/spend/page";
import { breakdown } from "@/server/spend/spend";
import { SAVING_HOURS } from "@/server/spend/tips";
import { SavingActions } from "./forms";

export const metadata: Metadata = { title: "Cloud spend" };

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function StatCard({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <span className="text-callout text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="text-callout text-ink-muted">{hint}</span> : null}
    </Card>
  );
}

export default async function SpendPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { db, billing, organisation, actor, today, currency, locale } = await requireBilling();
  const view = await spendOverview(db, billing, organisation.id, currency, today);
  const { months } = view;
  const fmt = (minor: bigint) => formatMoney(money(minor, currency), locale);
  const current = months.length - 1;
  const wanted = (await searchParams).month;
  const found = months.findIndex((m) => toDateOnly(m.month).slice(0, 7) === wanted);
  const selected = found >= 0 ? found : current;
  const manage = can(actor, "order");

  const hasSpend = months.some((m) => m.total !== 0n);
  const lastMonth = months[current - 1];
  const change = lastMonth && lastMonth.total > 0n ? Number(((view.forecast.total.amountMinor - lastMonth.total) * 1000n) / lastMonth.total) / 10 : null;

  const chart: ChartMonth[] = months.map((m, i) => ({
    key: toDateOnly(m.month).slice(0, 7),
    short: SHORT[m.month.getUTCMonth()],
    long: formatMonth(m.month),
    value: Number(m.total),
    label: fmt(m.total),
    categories: m.byCategory.map((c) => ({ name: c.category, label: fmt(c.amountMinor) })),
    current: i === current,
    forecast: i === current ? Number(view.forecast.total.amountMinor) : undefined,
    forecastLabel: i === current ? fmt(view.forecast.total.amountMinor) : undefined,
    selected: i === selected,
  }));

  const rows = breakdown(months, selected);
  const biggest = rows.reduce((n, r) => (r.amountMinor > n ? r.amountMinor : n), 0n);
  const azure = azureMonth(view.usage, view.subscriptions, months[current].month, currency);
  const openSavings = view.savings.filter((s) => s.status === "OPEN");
  const asked = view.savings.filter((s) => s.status === "ASKED");

  if (!hasSpend && !view.subscriptions.length) {
    return (
      <>
        <PageHeader title="Cloud spend" description="What you spend with us each month, where it goes, and where you could spend less." />
        <Card>
          <CardBody className="flex flex-col items-start gap-4 py-10">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-link">
              <ChartColumn aria-hidden className="size-6" />
            </span>
            <div className="flex max-w-2xl flex-col gap-1">
              <h2 className="text-title-2 text-ink">Nothing spent yet</h2>
              <p className="text-ink-muted">Once your first invoice is out, your spend shows here month by month, with a forecast for this month and ways to spend less.</p>
            </div>
            <Button asChild>
              <Link href="/app/marketplace">Browse the marketplace</Link>
            </Button>
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Cloud spend" description="What you spend with us each month, where it goes, and where you could spend less. Amounts are before VAT." />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
          <StatCard label={`${formatMonth(months[current].month)} so far`} hint={view.lastUsageDay ? `Azure usage up to ${formatDay(view.lastUsageDay)}` : "Invoices issued this month"}>
            <Amount locale={locale} value={money(months[current].total, currency)} size="title-1" className="text-ink" />
          </StatCard>
          <StatCard
            label={`Forecast for ${formatMonth(months[current].month)}`}
            hint={
              change === null ? (
                "Running services plus usage"
              ) : (
                <span className="inline-flex items-center gap-1">
                  {change > 0 ? <ArrowUpRight aria-hidden className="size-4" /> : <ArrowDownRight aria-hidden className="size-4" />}
                  {change === 0 ? "The same as" : `${Math.abs(change).toLocaleString(locale)}% ${change > 0 ? "more than" : "less than"}`} last month
                </span>
              )
            }
          >
            <Amount locale={locale} value={view.forecast.total} size="title-1" className="text-ink" />
          </StatCard>
          <StatCard label={lastMonth ? formatMonth(lastMonth.month) : "Last month"} hint="Invoiced and used">
            <Amount locale={locale} value={money(lastMonth?.total ?? 0n, currency)} size="title-1" className="text-ink" />
          </StatCard>
          <StatCard label="Savings found" hint={openSavings.length ? `${openSavings.length} ${openSavings.length === 1 ? "way" : "ways"} to spend less, a month` : "Nothing to cut right now"}>
            <Amount locale={locale} value={view.savingsTotal} size="title-1" className={view.savingsTotal.amountMinor > 0n ? "text-ink" : "text-positive"} />
          </StatCard>
        </div>

        <Card aria-labelledby="by-month">
          <CardHeader id="by-month" title="Spend by month" description="Choose a month to see where it went." />
          <CardBody>
            <SpendChart months={chart} locale={locale} currency={currency} exponent={currencyInfo(currency).exponent} />
            <details className="mt-5 text-callout">
              <summary className="cursor-pointer font-semibold text-link">Show as a table</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-ink-muted">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-4 font-semibold">Month</th>
                      <th scope="col" className="py-2 pr-4 text-right font-semibold">Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...months].reverse().map((m, i) => (
                      <tr key={toDateOnly(m.month)}>
                        <th scope="row" className="py-2 pr-4 font-normal text-ink">
                          {formatMonth(m.month)}
                          {i === 0 ? " (so far)" : ""}
                        </th>
                        <td className="py-2 pr-4 text-right text-ink tabular-nums">{fmt(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardBody>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card aria-labelledby="breakdown-title" id="breakdown" className="scroll-mt-24">
            <CardHeader
              id="breakdown-title"
              title={`Where it went in ${formatMonth(months[selected].month)}`}
              description={selected === current ? "So far this month, compared with the whole of last month." : "Compared with the month before."}
            />
            <CardBody>
              {rows.length ? (
                <ul className="flex flex-col gap-4">
                  {rows.map((r) => {
                    const diff = r.amountMinor - r.previousMinor;
                    return (
                      <li key={r.category} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold text-ink">{r.category}</span>
                          <span className="text-ink tabular-nums">{fmt(r.amountMinor)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                          <div className="h-full rounded-full bg-brand" style={{ width: biggest > 0n ? `${Number((r.amountMinor * 1000n) / biggest) / 10}%` : "0" }} />
                        </div>
                        {selected > 0 ? (
                          <span className="text-caption text-ink-muted">
                            {diff === 0n ? "No change" : `${diff > 0n ? "Up" : "Down"} ${formatMoney(money(diff < 0n ? -diff : diff, currency), locale)}`} from {formatMonth(months[selected - 1].month)}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-ink-muted">Nothing was spent this month.</p>
              )}
            </CardBody>
          </Card>

          <Card aria-labelledby="savings">
            <CardHeader id="savings" title="Ways to spend less" description="We look for these every day. Nothing changes until you ask." />
            {openSavings.length || asked.length ? (
              <ul className="divide-y divide-border">
                {[...openSavings, ...asked].map((s) => (
                  <li key={s.key} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
                        <PiggyBank aria-hidden className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-semibold text-ink">{s.title}</span>
                          {s.monthly ? <span className="text-callout font-semibold text-positive tabular-nums">Save {formatMoney(s.monthly, locale)} a month</span> : null}
                        </div>
                        <p className="text-callout text-ink-muted">{s.detail}</p>
                        {s.source === "STAFF" ? <span className="text-caption text-ink-muted">Found by our team</span> : null}
                      </div>
                    </div>
                    <div className="sm:pl-11">
                      {s.status === "ASKED" ? (
                        <Badge tone="info">Our team is on it, usually within {SAVING_HOURS} working hours</Badge>
                      ) : s.href ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={s.href}>Review licences</Link>
                        </Button>
                      ) : manage && s.tipId ? (
                        <SavingActions tipId={s.tipId} title={s.title} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-ink-muted">Nothing to cut right now. Every licence is in use and nothing is sitting idle.</p>
              </CardBody>
            )}
          </Card>
        </div>

        {azure.length ? (
          <Card aria-labelledby="azure">
            <CardHeader
              id="azure"
              title={`Azure usage in ${formatMonth(months[current].month)}`}
              description={view.lastUsageDay ? `Usage reaches us daily from Microsoft. The latest is for ${formatDay(view.lastUsageDay, true)}.` : "Usage shows here once Microsoft reports it."}
            />
            <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              {azure.map((s) => (
                <section key={s.id} aria-labelledby={`sub-${s.id}`} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Cloud aria-hidden className="size-5 text-link" />
                      <h3 id={`sub-${s.id}`} className="font-semibold text-ink">
                        {s.name}
                      </h3>
                    </div>
                    <span className="text-title-2 text-ink tabular-nums">{fmt(s.total)}</span>
                  </div>
                  {s.groups.length ? (
                    <table className="w-full text-left text-callout">
                      <caption className="sr-only">Usage by resource group</caption>
                      <thead className="text-ink-muted">
                        <tr className="border-b border-border">
                          <th scope="col" className="py-2 pr-4 font-semibold">Resource group</th>
                          <th scope="col" className="py-2 text-right font-semibold">So far</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {s.groups.slice(0, 6).map((g) => (
                          <tr key={g.group}>
                            <td className={cn("py-2 pr-4 text-ink", !g.group && "text-ink-muted")}>{g.group || "Not in a group"}</td>
                            <td className="py-2 text-right text-ink tabular-nums">{fmt(g.amountMinor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-callout text-ink-muted">No usage yet this month.</p>
                  )}
                </section>
              ))}
            </div>
            {view.forecast.usage ? (
              <CardBody className="border-t border-border text-callout text-ink-muted">
                At {view.forecast.usageBasis === "pace" ? "this month's pace" : "last month's level"}, Azure usage comes to about {formatMoney(view.forecast.usage, locale)} for {formatMonth(months[current].month)}, on top of {formatMoney(view.forecast.fixed, locale)} for your services.
              </CardBody>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
