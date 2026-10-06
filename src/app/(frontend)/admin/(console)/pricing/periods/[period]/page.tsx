import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { formatLongDate, formatMoment, parseDateOnly, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { priceDay, periodOf } from "@/lib/domain/pricing";
import { requireStaffCan } from "@/server/admin/context";
import { bpsToPercent, microsToRate } from "@/server/admin/pricing";
import { prisma } from "@/server/db";
import { runChanges, runRates } from "@/server/pricing/periods";
import { ApprovePeriodForm } from "../../forms";

export const metadata: Metadata = { title: "Price book" };

const L = company.staffLocale;

/**
 * One period's price book: the rates, every price that changes and how it
 * was approved. The approval email links here; approving takes the one
 * button, never just opening the link.
 */
export default async function PeriodPage({ params }: { params: Promise<{ period: string }> }) {
  await requireStaffCan("managePricing");
  const { period } = await params;
  const monday = parseDateOnly(period);
  if (!monday) notFound();
  const run = await prisma.priceBookRun.findUnique({ where: { period }, include: { table: { select: { publishedOn: true } } } });
  if (!run) notFound();
  const changes = runChanges(run).slice().sort((a, b) => b.changeBps - a.changeBps);
  const show = (v: string | null | undefined, currency: string) => (v ? formatMoney({ amountMinor: BigInt(v), currency }, L) : "None");
  const current = run.period === periodOf(priceDay(todayIn(DEFAULT_TIME_ZONE)));

  return (
    <>
      <Link href="/admin/pricing" className="mb-4 inline-flex items-center gap-1 text-callout text-link">
        <ArrowLeft aria-hidden className="size-4" />
        Pricing
      </Link>
      <PageHeader
        title={`Price book from ${formatLongDate(monday)}`}
        description={`Worked out ${formatMoment(run.createdAt, DEFAULT_TIME_ZONE)} from Bank of Botswana's rates published ${formatLongDate(run.table.publishedOn)}, the currency buffer and each category's margin.`}
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="state-title">
          <CardHeader id="state-title" title={run.status === "AWAITING_APPROVAL" ? "Waiting for approval" : run.status === "NO_CHANGES" ? "No price changes" : "In effect"} />
          <CardBody className="flex flex-col gap-4">
            {run.status === "AWAITING_APPROVAL" ? (
              <>
                <p className="text-ink">
                  The largest change is {bpsToPercent(run.maxChangeBps)}%, more than the {bpsToPercent(run.thresholdBps)}% approved automatically. The previous prices stay in effect, here and in WHMCS, until you approve.
                </p>
                {current ? <ApprovePeriodForm period={run.period} label={`Approve ${changes.length} ${changes.length === 1 ? "price" : "prices"}`} /> : <p className="text-ink-muted">A newer price book has replaced this one, so these prices can no longer be approved.</p>}
              </>
            ) : run.status === "NO_CHANGES" ? (
              <p className="text-ink">Every price stayed the same with the new rates.</p>
            ) : (
              <p className="text-ink">
                {run.approvedByName ? `Approved by ${run.approvedByName}` : `Approved automatically: the largest change, ${bpsToPercent(run.maxChangeBps)}%, is within the ${bpsToPercent(run.thresholdBps)}% threshold`}
                {run.approvedAt ? `, ${formatMoment(run.approvedAt, DEFAULT_TIME_ZONE)}.` : "."}{" "}
                {run.syncedAt ? `Sent to billing ${formatMoment(run.syncedAt, DEFAULT_TIME_ZONE)}.` : run.syncError ? `Not in WHMCS yet: ${run.syncError} We try again each time the rates are checked.` : "Not sent to billing yet."}
              </p>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="rates-title">
          <CardHeader id="rates-title" title="Rates" />
          <ul className="divide-y divide-border">
            {runRates(run).map((r) => (
              <li key={`${r.base}/${r.quote}`} className="px-5 py-3 tabular-nums sm:px-6">
                1 {r.base} = {microsToRate(BigInt(r.rateMicros))} {r.quote}
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="changes-title">
          <CardHeader id="changes-title" title="Price changes" description="Per unit per month, and a year for domain names. Largest change first." />
          {changes.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">None.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-callout">
                <thead className="text-ink-muted">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Item</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Market</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Before</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">After</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {changes.map((c) => (
                    <tr key={`${c.market}:${c.item}`}>
                      <td className="px-5 py-3 sm:px-6">{c.name}</td>
                      <td className="px-3 py-3">{c.market}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        {show(c.from, c.currency)}
                        {c.toRenew ? <span className="block text-caption text-ink-muted">renews {show(c.fromRenew, c.currency)}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        {show(c.to, c.currency)}
                        {c.toRenew ? <span className="block text-caption text-ink-muted">renews {show(c.toRenew, c.currency)}</span> : null}
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">{c.changeBps > run.thresholdBps ? <Badge tone="warning">{bpsToPercent(c.changeBps)}%</Badge> : `${bpsToPercent(c.changeBps)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
