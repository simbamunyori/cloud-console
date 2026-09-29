import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { cn } from "@/lib/cn";
import { formatMoment, formatMonth, todayIn } from "@/lib/dates";
import { currencySymbol, formatMoney, toPlainAmount, type Money } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { STATUS_LABEL } from "@/server/catalogue/visibility";
import { requireStaffCan } from "@/server/admin/context";
import { bpsToPercent, microsToRate, pricingOverview } from "@/server/admin/pricing";
import { awaitingApproval, bookRows, type BookRow } from "@/server/catalogue/price-book";
import { prisma } from "@/server/db";
import { listMarkets } from "@/server/markets/markets";
import { setBufferAction, setMarginAction, setRateAction } from "../actions";
import { SettingForm } from "../forms";
import { ApproveAllForm, ApproveForm, OfferedSwitch } from "./forms";

export const metadata: Metadata = { title: "Pricing" };

const L = company.staffLocale;
const monthLabel = (m: string) => formatMonth(new Date(`${m}-01T00:00:00Z`));
const show = (m: Money | null | undefined) => (m ? formatMoney(m, L) : null);

function describeChange(field: string, from: string | null, to: string, currencies: Map<string, string>, names: Map<string, string>) {
  const [kind, key, ...rest] = field.split(":");
  const amount = (v: string | null) => {
    const currency = currencies.get(key);
    return v === null ? "none" : currency ? formatMoney({ amountMinor: BigInt(v), currency }, L) : v;
  };
  if (kind === "margin") return `Margin on ${key}: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "buffer") return `Currency buffer: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "rate") return `${key} rate for ${rest[0]}: ${from === null ? "none" : microsToRate(BigInt(from))} to ${microsToRate(BigInt(to))}`;
  const itemName = (parts: string[]) => names.get(parts.join(":")) ?? parts.at(-1);
  if (kind === "price") return `${itemName(rest.slice(0, -1))} in ${key} from ${monthLabel(rest.at(-1)!)}: ${amount(from)} to ${amount(to)}`;
  if (kind === "offered") return `${itemName(rest)} ${to === "true" ? "offered" : "withdrawn"} in ${key}`;
  return `${field}: ${to}`;
}

function PriceCell({ money, renew, note }: { money: Money | null; renew?: Money | null; note?: string }) {
  if (!money) return <span className="text-ink-muted">{note ?? "None"}</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {show(money)}
      {renew ? <span className="block text-caption text-ink-muted">renews {show(renew)}</span> : null}
    </span>
  );
}

function Row({ r, market, symbol }: { r: BookRow; market: string; symbol: string }) {
  const waiting = awaitingApproval(r);
  return (
    <tr className={r.offered ? undefined : "text-ink-muted"}>
      <td className="w-56 px-5 py-3 sm:px-6">
        <span className={r.offered ? "text-ink" : undefined}>{r.name}</span>
        <span className="block text-caption text-ink-muted">
          {r.offered ? r.group : `${r.group}. Not offered here`}
          {r.status === "LIVE" ? "" : `. ${STATUS_LABEL[r.status]}`}
        </span>
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap text-ink-muted tabular-nums">{show(r.cost)}</td>
      <td className="px-3 py-3 text-right">
        <PriceCell money={r.current} renew={r.currentRenew} note="Not priced" />
      </td>
      <td className="px-3 py-3 text-right">
        <PriceCell money={r.scheduled} renew={r.scheduledRenew} note="No change" />
      </td>
      <td className="px-3 py-3 text-right">
        {r.suggestion ? (
          <ApproveForm
            market={market}
            item={r.item}
            name={r.name}
            amount={toPlainAmount(r.suggestion.price)}
            renew={r.suggestion.renew ? toPlainAmount(r.suggestion.renew) : undefined}
            currencySymbol={symbol}
            label={waiting ? `Approve for ${monthLabel(r.targetMonth).split(" ")[0]}` : "Approve again"}
          />
        ) : (
          <span className="text-callout text-warning">{r.problem ?? "No suggestion"}</span>
        )}
      </td>
      <td className="px-5 py-3 text-right sm:px-6">
        <OfferedSwitch market={market} item={r.item} name={r.name} offered={r.offered} />
      </td>
    </tr>
  );
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  await requireStaffCan("managePricing");
  const markets = await listMarkets(prisma);
  const requested = (await searchParams).market;
  const selected = markets.find((m) => m.code === requested) ?? markets.find((m) => m.isDefault) ?? markets[0];
  const today = todayIn(DEFAULT_TIME_ZONE);
  const month = monthOf(today);
  const [o, book] = await Promise.all([pricingOverview(prisma, month, selected.currency), bookRows(prisma, selected.code, month)]);
  const nextLabel = monthLabel(o.next);
  const waiting = book.rows.filter(awaitingApproval).length;
  const symbol = currencySymbol(selected.currency, L);
  const currencies = new Map(markets.map((m) => [m.code, m.currency]));
  const names = new Map(book.rows.map((r) => [r.item, r.name]));

  return (
    <>
      <PageHeader
        title="Pricing"
        description={`Each market has its own price book in its own currency. We suggest prices from our cost, the month's exchange rate, the currency buffer and the category margin, rounded up to a whole unit of the currency. Customers only see prices you approve. ${formatMonth(today)} prices are fixed, so changes apply from ${nextLabel}.`}
      />
      <nav aria-label="Markets" className="mb-6 flex flex-wrap gap-2">
        {markets.map((m) => (
          <Link
            key={m.code}
            href={`/admin/pricing?market=${m.code}`}
            aria-current={m.code === selected.code ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-callout font-semibold", m.code === selected.code ? "bg-navy text-on-navy" : "bg-surface-2 text-ink hover:bg-border")}
          >
            {m.name} ({m.currency}){m.enabled ? "" : ", off"}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="book-title">
          <CardHeader
            id="book-title"
            title={`${selected.name} price book`}
            description={`Per unit per month in ${selected.currency}, and a year for domain names. Approve a suggestion as it is, or type a different price first.`}
            action={<ApproveAllForm market={selected.code} count={waiting} />}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-240 text-left text-callout">
              <thead className="text-ink-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Product</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Our cost</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">{formatMonth(today)}</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">From {nextLabel}</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Suggested</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                    <span className="sr-only">Offered in {selected.name}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {book.rows.map((r) => (
                  <Row key={r.item} r={r} market={selected.code} symbol={symbol} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card aria-labelledby="fx-title">
            <CardHeader id="fx-title" title={`Exchange rates into ${selected.currency}`} description={`The rates for ${nextLabel}. Set them near the end of the month, then approve the new suggestions.`} />
            <CardBody className="flex flex-col gap-6">
              {o.rates.length === 0 ? <p className="text-ink-muted">Everything in this market is priced from costs in {selected.currency}, so no rate is needed.</p> : null}
              {o.rates.map((r) => (
                <div key={r.base} className="flex flex-col gap-2">
                  <span className="text-callout text-ink-muted">
                    This month 1 {r.base} = {r.thisMonth ? microsToRate(r.thisMonth.rateMicros) : "not set"} {r.quote}
                  </span>
                  <SettingForm action={setRateAction} name="rate" label={`1 ${r.base} in ${r.quote}`} defaultValue={r.nextMonth ? microsToRate(r.nextMonth.rateMicros) : ""} hidden={{ base: r.base, quote: r.quote }} />
                </div>
              ))}
              <SettingForm action={setBufferAction} name="buffer" label="Currency buffer, every market" suffix="%" defaultValue={bpsToPercent(o.bufferBps)} />
              <p className="text-callout text-ink-muted">The buffer is added to anything we pay for in another currency, to cover the rate moving during the month.</p>
            </CardBody>
          </Card>
          <Card aria-labelledby="margin-title">
            <CardHeader id="margin-title" title="Margins, every market" description="Added on top of cost for each category. Products with a fixed price ignore it; domain names use the margin of their category." />
            <CardBody className="flex flex-col gap-5">
              {o.categories.map((c) => (
                <SettingForm key={c.key} action={setMarginAction} name="margin" label={c.name} suffix="%" defaultValue={bpsToPercent(c.marginBps)} hidden={{ categoryKey: c.key }} />
              ))}
            </CardBody>
          </Card>
        </div>

        <Card aria-labelledby="log-title">
          <CardHeader id="log-title" title="Changes" description="Every change to margins, the buffer, rates, prices and what's offered, newest first." />
          {o.changes.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No changes yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {o.changes.map((c) => (
                <li key={c.id} className="flex flex-col gap-0.5 px-5 py-3 sm:px-6">
                  <span className="text-ink">{describeChange(c.field, c.fromValue, c.toValue, currencies, names)}</span>
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
