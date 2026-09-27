import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment, formatMonth, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { requireStaffCan } from "@/server/admin/context";
import { bpsToPercent, microsToRate, pricingOverview } from "@/server/admin/pricing";
import { prisma } from "@/server/db";
import { setBufferAction, setMarginAction, setRateAction } from "../actions";
import { SettingForm } from "../forms";

export const metadata: Metadata = { title: "Pricing" };

function describeChange(field: string, from: string | null, to: string) {
  const [kind, key, month] = field.split(":");
  if (kind === "margin") return `Margin on ${key}: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "buffer") return `Currency buffer: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "rate") return `${key} rate for ${month}: ${from === null ? "none" : microsToRate(BigInt(from))} to ${microsToRate(BigInt(to))}`;
  return `${field}: ${to}`;
}

export default async function PricingPage() {
  await requireStaffCan("managePricing");
  const today = todayIn(DEFAULT_TIME_ZONE);
  const month = monthOf(today);
  const o = await pricingOverview(prisma, month);
  const nextLabel = formatMonth(new Date(`${o.next}-01T00:00:00Z`));

  return (
    <>
      <PageHeader
        title="Pricing"
        description={`Prices are worked out from our cost, the exchange rate, the currency buffer and the category margin, then rounded up to a whole unit of the currency. ${formatMonth(today)} prices are fixed; changes here apply from ${nextLabel}.`}
      />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card aria-labelledby="fx-title">
            <CardHeader id="fx-title" title="Exchange rates" description={`The rate for ${nextLabel}. Set it near the end of the month.`} />
            <CardBody className="flex flex-col gap-6">
              {o.rates.map((r) => (
                <div key={r.base} className="flex flex-col gap-2">
                  <span className="text-callout text-ink-muted">
                    This month 1 {r.base} = {r.thisMonth ? microsToRate(r.thisMonth.rateMicros) : "not set"} {r.quote}
                  </span>
                  <SettingForm action={setRateAction} name="rate" label={`1 ${r.base} in ${r.quote}`} defaultValue={r.nextMonth ? microsToRate(r.nextMonth.rateMicros) : ""} hidden={{ base: r.base, quote: r.quote }} />
                </div>
              ))}
              <SettingForm action={setBufferAction} name="buffer" label="Currency buffer" suffix="%" defaultValue={bpsToPercent(o.bufferBps)} />
              <p className="text-callout text-ink-muted">The buffer is added to anything we pay for in another currency, to cover the rate moving during the month.</p>
            </CardBody>
          </Card>
          <Card aria-labelledby="margin-title">
            <CardHeader id="margin-title" title="Margins" description="Added on top of cost for each category. Products with a fixed price ignore it." />
            <CardBody className="flex flex-col gap-5">
              {o.categories.map((c) => (
                <SettingForm key={c.key} action={setMarginAction} name="margin" label={c.name} suffix="%" defaultValue={bpsToPercent(c.marginBps)} hidden={{ categoryKey: c.key }} />
              ))}
            </CardBody>
          </Card>
        </div>

        <Card aria-labelledby="prices-title">
          <CardHeader id="prices-title" title="Prices" description={`Per unit per month. ${nextLabel} shows what today's settings give.`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-callout">
              <thead className="text-ink-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Product</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Our cost</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">{formatMonth(today)}</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">{nextLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {o.rows.map((r) => {
                  const changed = r.thisMonth && r.nextMonth && r.thisMonth.amountMinor !== r.nextMonth.amountMinor;
                  return (
                    <tr key={r.productId}>
                      <td className="px-5 py-3 text-ink sm:px-6">
                        {r.name}
                        <span className="block text-caption text-ink-muted">{r.categoryName}</span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-ink-muted tabular-nums">{formatMoney(r.cost)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-ink tabular-nums">{r.thisMonth ? formatMoney(r.thisMonth) : "Not priced yet"}</td>
                      <td className={`px-5 py-3 text-right whitespace-nowrap tabular-nums sm:px-6 ${changed ? "font-semibold text-ink" : "text-ink"}`}>{r.nextMonth ? formatMoney(r.nextMonth) : "Needs a rate"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card aria-labelledby="log-title">
          <CardHeader id="log-title" title="Changes" description="Every change to margins, the buffer and rates, newest first." />
          {o.changes.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No changes yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {o.changes.map((c) => (
                <li key={c.id} className="flex flex-col gap-0.5 px-5 py-3 sm:px-6">
                  <span className="text-ink">{describeChange(c.field, c.fromValue, c.toValue)}</span>
                  <span className="text-callout text-ink-muted">
                    {c.user.name}, {formatMoment(c.createdAt, DEFAULT_TIME_ZONE)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
