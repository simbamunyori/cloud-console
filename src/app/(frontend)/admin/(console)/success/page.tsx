import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment, formatMonth } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { SOURCE_LABEL } from "@/server/leads/sequences";
import { FIGURES, figureStatus, figureValue, formatFigure, formatTarget, monthBefore, PILLAR_KEYS, PILLARS, successSettings, type FigureKey, type FigureStatus, type SuccessData } from "@/server/success/success";
import { RefreshButton, SuccessSettingsForm } from "./forms";

export const metadata: Metadata = { title: "Success" };

const STATUS: Record<FigureStatus, [string, "positive" | "warning" | "neutral"]> = {
  "on-track": ["On track", "positive"],
  behind: ["Behind", "warning"],
  "no-target": ["No target", "neutral"],
  "no-data": ["Not enough data", "neutral"],
};

const HINT: Record<FigureKey, string> = {
  managedCustomers: "At least this many at the month's end.",
  netNew: "New managed customers less those who left, each month.",
  managedMrr: "Whole amount a month, in the reporting currency.",
  managedShare: "Percent of all recurring revenue.",
  leads: "Leads in the month.",
  conversion: "Percent of the month's leads who have ordered.",
  firstWithin: "Percent of tickets whose first reply met the unit's target.",
  satisfaction: "Average rating, 1 to 5.",
  securityScore: "Average of customers' scores, 0 to 100.",
};

const monthLabel = (m: string) => formatMonth(new Date(`${m}-01T00:00:00Z`));

function Figures({ d, targets, title, note }: { d: SuccessData; targets: Partial<Record<FigureKey, number>>; title: string; note: string }) {
  return (
    <section aria-labelledby={`figures-${d.month}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`figures-${d.month}`} className="text-title-2 text-ink">
          {title}
        </h2>
        <p className="text-callout text-ink-muted">{note}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FIGURES.map((f) => {
          const t = targets[f.key];
          const [label, tone] = STATUS[figureStatus(figureValue(d, f.key), t)];
          return (
            <Card key={f.key} className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-callout text-ink-muted">{f.label}</span>
                <Badge tone={tone}>{label}</Badge>
              </div>
              <span className="text-title-2 text-ink tabular-nums">{formatFigure(d, f.key)}</span>
              <span className="text-caption text-ink-muted">{t === undefined ? "Set a target below." : `Target ${formatTarget(f.key, t, d.currency)}`}</span>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function Revenue({ d }: { d: SuccessData }) {
  const m = (minor: string) => formatMoney(money(BigInt(minor), d.currency), "en-BW");
  const total = BigInt(d.mrrTotal);
  const share = (minor: string) => (total ? Number((BigInt(minor) * 1000n) / total) / 10 : 0);
  return (
    <Card aria-labelledby="revenue-title">
      <CardHeader
        id="revenue-title"
        title="Recurring revenue by pillar"
        description={`${m(d.mrrTotal)} a month from ${d.customers} ${d.customers === 1 ? "customer" : "customers"}. Managed customers ${m(d.managedMrr)} (${d.managedCustomers}); hosting only ${m(d.hostingOnlyMrr)} (${d.hostingOnlyCustomers}). Longer billing periods are counted per month; other currencies at the latest exchange rate.`}
      />
      <CardBody className="flex flex-col gap-3">
        {PILLAR_KEYS.filter((k) => k !== "other" || d.mrrByPillar.other !== "0").map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-callout">
              <span className="text-ink">{PILLARS[k]}</span>
              <span className="text-ink tabular-nums">
                {m(d.mrrByPillar[k])} <span className="text-ink-muted">({share(d.mrrByPillar[k])}%)</span>
              </span>
            </div>
            <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={k === "growth" ? "h-full rounded-full bg-ink-muted" : "h-full rounded-full bg-brand"} style={{ width: `${share(d.mrrByPillar[k])}%` }} />
            </div>
          </div>
        ))}
        {d.unreadable || d.unconverted ? (
          <p className="text-callout text-warning">
            Not counted: {d.unreadable} {d.unreadable === 1 ? "customer" : "customers"} whose services couldn&apos;t be read from billing, and {d.unconverted} {d.unconverted === 1 ? "amount" : "amounts"} with no exchange rate to {d.currency}.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Leads({ d }: { d: SuccessData }) {
  return (
    <Card aria-labelledby="leads-title">
      <CardHeader id="leads-title" title="Leads by source" description={`${d.leads} in ${monthLabel(d.month)}; ${d.converted} have ordered since.`} />
      {d.leadsBySource.length ? (
        <ul className="divide-y divide-border">
          {d.leadsBySource.map((s) => (
            <li key={s.source} className="flex items-center justify-between gap-3 px-5 py-3 text-callout sm:px-6">
              <span className="text-ink">{SOURCE_LABEL[s.source]}</span>
              <span className="text-ink tabular-nums">
                {s.leads}, {s.converted} ordered
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <CardBody>
          <p className="text-ink-muted">No leads yet this month.</p>
        </CardBody>
      )}
    </Card>
  );
}

export default async function SuccessPage() {
  await requireStaffCan("viewSuccess");
  const [snapshots, settings, emailOn] = await Promise.all([prisma.successSnapshot.findMany({ orderBy: { month: "desc" }, take: 13 }), successSettings(prisma), featureOn(prisma, "directors-report")]);
  const latest = snapshots[0];
  const current = latest ? (latest.data as unknown as SuccessData) : null;
  const previousRow = latest ? snapshots.find((s) => s.month === monthBefore(latest.month)) : undefined;
  const previous = previousRow ? (previousRow.data as unknown as SuccessData) : null;

  return (
    <>
      <PageHeader
        title="Success"
        description="How the business is doing against its targets: managed customers, recurring revenue by pillar, leads, response times, satisfaction and security scores. Worked out every night."
        actions={<RefreshButton />}
      />
      <div className="flex flex-col gap-8">
        {current ? (
          <>
            <Figures d={current} targets={settings.targets} title={`${monthLabel(current.month)} so far`} note={`Worked out ${formatMoment(latest.takenAt, DEFAULT_TIME_ZONE)}. Customers and revenue are as they stand; leads and tickets are this month's.`} />
            <div className="grid gap-6 xl:grid-cols-2">
              <Revenue d={current} />
              <Leads d={current} />
            </div>
          </>
        ) : (
          <Card>
            <CardBody>
              <p className="text-ink-muted">Nothing worked out yet. Press Refresh now, or wait for tonight.</p>
            </CardBody>
          </Card>
        )}

        {previous ? (
          <Figures
            d={previous}
            targets={settings.targets}
            title={monthLabel(previous.month)}
            note={previousRow!.reportedAt ? `Emailed to the directors ${formatMoment(previousRow!.reportedAt, DEFAULT_TIME_ZONE)}.` : "As it stood at the month's end."}
          />
        ) : null}

        {snapshots.length > 1 ? (
          <Card aria-labelledby="trend-title">
            <CardHeader id="trend-title" title="Month by month" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-callout">
                <thead className="border-b border-border text-ink-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-semibold sm:px-6">Month</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Managed customers</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Net new</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Revenue a month</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Managed share</th>
                    <th scope="col" className="px-5 py-2 text-right font-semibold sm:px-6">Leads</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {snapshots.map((s) => {
                    const d = s.data as unknown as SuccessData;
                    return (
                      <tr key={s.month}>
                        <td className="px-5 py-2 text-ink sm:px-6">{monthLabel(s.month)}</td>
                        <td className="px-3 py-2 text-right text-ink">{d.managedCustomers}</td>
                        <td className="px-3 py-2 text-right text-ink">{formatFigure(d, "netNew").replace("Not enough data", "–")}</td>
                        <td className="px-3 py-2 text-right text-ink">{formatMoney(money(BigInt(d.mrrTotal), d.currency), "en-BW")}</td>
                        <td className="px-3 py-2 text-right text-ink">{d.managedShare === null ? "–" : `${d.managedShare}%`}</td>
                        <td className="px-5 py-2 text-right text-ink sm:px-6">{d.leads}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        <Card aria-labelledby="targets-title">
          <CardHeader
            id="targets-title"
            title="Targets and the monthly email"
            description={`Leave a target blank to show the figure without one. The monthly email is ${emailOn ? "on" : "off; turn on Monthly success email in Features"}.`}
          />
          <CardBody>
            <SuccessSettingsForm
              emails={settings.directorEmails.join("\n")}
              figures={FIGURES.map((f) => ({ key: f.key, label: f.label, hint: HINT[f.key], value: settings.targets[f.key] === undefined ? "" : String(settings.targets[f.key]) }))}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
