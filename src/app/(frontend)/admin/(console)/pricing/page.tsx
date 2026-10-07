import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { cn } from "@/lib/cn";
import { formatLongDate, formatMoment, formatPriceStart, todayIn } from "@/lib/dates";
import { currencySymbol, formatMoney, toPlainAmount, type Money } from "@/lib/domain/money";
import { priceDay } from "@/lib/domain/pricing";
import { STATUS_LABEL } from "@/server/catalogue/visibility";
import { requireStaffCan } from "@/server/admin/context";
import { bpsToPercent, microsToRate, pricingOverview, rateHistory } from "@/server/admin/pricing";
import { awaitingApproval, bookRows, type BookRow } from "@/server/catalogue/price-book";
import { prisma } from "@/server/db";
import { listMarkets } from "@/server/markets/markets";
import { ratesAutomatic } from "@/server/pricing/jobs";
import { recentRuns } from "@/server/pricing/periods";
import { planMargins, type MarketMargins } from "@/server/pricing/margins";
import { CHECK_TIMES } from "@/server/pricing/official-rates";
import { setAutoApproveAction, setBufferAction, setMarginAction, setMarginFloorAction, setRateAction } from "../actions";
import { SettingForm } from "../forms";
import { AcceptRatesForm, ApproveAllForm, ApproveForm, OfferedSwitch } from "./forms";

export const metadata: Metadata = { title: "Pricing" };

const L = company.staffLocale;
const show = (m: Money | null | undefined) => (m ? formatMoney(m, L) : null);

function describeChange(field: string, from: string | null, to: string, currencies: Map<string, string>, names: Map<string, string>) {
  const [kind, key, ...rest] = field.split(":");
  const amount = (v: string | null) => {
    const currency = currencies.get(key);
    return v === null ? "none" : currency ? formatMoney({ amountMinor: BigInt(v), currency }, L) : v;
  };
  if (kind === "margin") return `Margin on ${key}: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "auto-approve") return `Automatic approval up to: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "margin-floor") return `Margin floor: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "buffer") return `Currency buffer: ${from === null ? "none" : `${bpsToPercent(Number(from))}%`} to ${bpsToPercent(Number(to))}%`;
  if (kind === "rate") return `${key} rate for ${rest[0]}: ${from === null ? "none" : microsToRate(BigInt(from))} to ${microsToRate(BigInt(to))}`;
  const itemName = (parts: string[]) => names.get(parts.join(":")) ?? parts.at(-1);
  if (kind === "price") return `${itemName(rest.slice(0, -1))} in ${key} from ${formatPriceStart(rest.at(-1)!)}: ${amount(from)} to ${amount(to)}`;
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

/** The plan margin report (STRATEGY_ROLLOUT U3): each plan's true cost, price and margin in the chosen market. */
function MarginReport({ report, floorBps, featureOn }: { report: MarketMargins; floorBps: number; featureOn: boolean }) {
  const below = report.rows.filter((r) => r.belowFloor).length;
  return (
    <Card aria-labelledby="plan-margins-title">
      <CardHeader
        id="plan-margins-title"
        title={`Plan margins in ${report.name}`}
        description={`Each plan's true cost (its own plus the email security and backup it includes) at today's rates, without the buffer, against today's price. ${featureOn ? "Included products are on: customers see them and new suggestions cover their cost." : "Included products are off: customers don't see them yet, and the price book doesn't count their cost until Admin > Features turns them on."}`}
        action={below ? <Badge tone="warning">{below === 1 ? "1 plan" : `${below} plans`} below {bpsToPercent(floorBps)}%</Badge> : undefined}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-200 text-left text-callout">
          <thead className="text-ink-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Plan</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">True cost</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Price now</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.rows.map((r) => (
              <tr key={r.slug}>
                <td className="px-5 py-3 sm:px-6">
                  <Link href={`/admin/catalogue/products/${r.slug}`} className="text-ink underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                  <span className="block text-caption text-ink-muted">
                    {r.unitLabel}
                    {r.included.length ? `. Includes ${r.included.join(", ")}` : ""}
                    {r.status === "LIVE" ? "" : `. ${STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}`}
                  </span>
                  {r.problem ? <span className="block text-caption text-warning">{r.problem}</span> : null}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{show(r.cost) ?? <span className="text-ink-muted">Unknown</span>}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{show(r.price) ?? <span className="text-ink-muted">Not priced</span>}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums sm:px-6">
                  {r.marginBps === null ? (
                    <span className="text-ink-muted">None</span>
                  ) : r.belowFloor ? (
                    <Badge tone="warning">{bpsToPercent(r.marginBps)}%, below the floor</Badge>
                  ) : (
                    `${bpsToPercent(r.marginBps)}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardBody className="border-t border-border">
        <SettingForm action={setMarginFloorAction} name="floor" label="Warn below a margin of, every market" suffix="%" defaultValue={bpsToPercent(floorBps)} />
      </CardBody>
    </Card>
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
            label={waiting ? (r.current ? `Approve from ${formatPriceStart(r.targetMonth)}` : "Approve from today") : "Approve again"}
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
  const month = priceDay(today);
  const [o, book, runs, margins] = await Promise.all([pricingOverview(prisma, month, selected.currency), bookRows(prisma, selected.code, month), recentRuns(prisma), planMargins(prisma, month)]);
  const marketMargins = margins.markets.find((m) => m.code === selected.code);
  const automatic = ratesAutomatic();
  const history = await rateHistory(prisma, o.rates.map((r) => r.base), selected.currency);
  const nextLabel = formatPriceStart(o.next);
  const waiting = book.rows.filter(awaitingApproval).length;
  const symbol = currencySymbol(selected.currency, L);
  const currencies = new Map(markets.map((m) => [m.code, m.currency]));
  const names = new Map(book.rows.map((r) => [r.item, r.name]));

  return (
    <>
      <PageHeader
        title="Pricing"
        description={`Each market has its own price book in its own currency. We suggest prices from our cost, the exchange rate, the currency buffer and the category margin, rounded up to a whole unit of the currency. Customers only see prices you approve. Prices change every 14 days, since quotes are valid for 14 days, so changes apply from ${nextLabel}.${automatic ? ` On each change day, the new prices are worked out from Bank of Botswana's rates and approved automatically when none moves by more than ${bpsToPercent(o.autoApproveBps)}%.` : ""}`}
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
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Now</th>
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

        {marketMargins?.rows.length ? <MarginReport report={marketMargins} floorBps={margins.floorBps} featureOn={margins.featureOn} /> : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card aria-labelledby="fx-title">
            <CardHeader
              id="fx-title"
              title={`Exchange rates into ${selected.currency}`}
              description={automatic ? `Bank of Botswana's reference rates. Each price change uses the newest table published before it; the next is ${nextLabel}.` : `The rates from ${nextLabel}. Set them before then, then approve the new suggestions.`}
            />
            <CardBody className="flex flex-col gap-6">
              {o.rates.length === 0 ? <p className="text-ink-muted">Everything in this market is priced from costs in {selected.currency}, so no rate is needed.</p> : null}
              {o.rates.map((r) =>
                automatic ? (
                  <p key={r.base} className="text-callout text-ink">
                    Now: 1 {r.base} = {r.thisPeriod ? microsToRate(r.thisPeriod.rateMicros) : "not set"} {r.quote}
                    <span className="block text-ink-muted">{r.thisPeriod?.sourceDate ? `Bank of Botswana, published ${formatLongDate(r.thisPeriod.sourceDate)}` : r.thisPeriod?.setById ? "Typed by staff" : "Not from Bank of Botswana yet"}</span>
                  </p>
                ) : (
                  <div key={r.base} className="flex flex-col gap-2">
                    <span className="text-callout text-ink-muted">
                      Now 1 {r.base} = {r.thisPeriod ? microsToRate(r.thisPeriod.rateMicros) : "not set"} {r.quote}
                    </span>
                    <SettingForm action={setRateAction} name="rate" label={`1 ${r.base} in ${r.quote}`} defaultValue={r.nextPeriod ? microsToRate(r.nextPeriod.rateMicros) : ""} hidden={{ base: r.base, quote: r.quote }} />
                  </div>
                ),
              )}
              <SettingForm action={setBufferAction} name="buffer" label="Currency buffer, every market" suffix="%" defaultValue={bpsToPercent(o.bufferBps)} />
              <p className="text-callout text-ink-muted">The buffer is added to anything we pay for in another currency, to cover the rate moving while prices are fixed.{automatic ? " You get an email if the rate moves past it." : ""}</p>
              {automatic ? (
                <>
                  <SettingForm action={setAutoApproveAction} name="threshold" label="Approve automatically up to" suffix="%" defaultValue={bpsToPercent(o.autoApproveBps)} />
                  <p className="text-callout text-ink-muted">When any price would move by more, Admins get an email to approve them instead, and the previous prices stay until then.</p>
                </>
              ) : null}
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

        <Card aria-labelledby="months-title">
          <CardHeader id="months-title" title="Price books" description="Built every 14 days, at 06:00 on a Monday, from Bank of Botswana's rates and the buffer, every market at once." />
          {runs.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">{automatic ? `None yet. The first one is built on ${nextLabel}.` : "Rates are typed by hand until ALLRATESTODAY_API_KEY is set on the server (docs/exchange-rates.md)."}</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <span className="flex flex-col gap-0.5">
                    <Link href={`/admin/pricing/periods/${r.period}`} className="text-link underline-offset-2 hover:underline">
                      From {formatPriceStart(r.period)}
                    </Link>
                    <span className="text-callout text-ink-muted">
                      Rates published {formatLongDate(r.table.publishedOn)}. {r.maxChangeBps ? `Largest change ${bpsToPercent(r.maxChangeBps)}%.` : "No price changes."}
                      {r.status === "APPLIED" ? (r.approvedByName ? ` Approved by ${r.approvedByName}.` : " Approved automatically.") : ""}
                    </span>
                  </span>
                  {r.status === "AWAITING_APPROVAL" ? (
                    <Badge tone="warning">Waiting for approval</Badge>
                  ) : r.status === "NO_CHANGES" ? (
                    <Badge>No changes</Badge>
                  ) : r.syncError ? (
                    <Badge tone="negative">Not in WHMCS yet</Badge>
                  ) : (
                    <Badge tone="positive">In effect</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {automatic || history.length ? (
          <Card aria-labelledby="bob-title">
            <CardHeader
              id="bob-title"
              title="Bank of Botswana rates"
              description={`Fetched at ${CHECK_TIMES} each day. ${o.ratesCheckedAt ? `Last checked ${formatMoment(o.ratesCheckedAt, DEFAULT_TIME_ZONE)}.` : "Not checked yet."}`}
            />
            {o.ratesError ? (
              <CardBody>
                <p className="text-callout text-negative">The last check failed: {o.ratesError} The rates below stay in use.</p>
              </CardBody>
            ) : null}
            {history.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">No tables yet.</p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-160 text-left text-callout">
                  <thead className="text-ink-muted">
                    <tr className="border-b border-border">
                      <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Published</th>
                      {o.rates.map((r) => (
                        <th key={r.base} scope="col" className="px-3 py-3 text-right font-semibold">
                          1 {r.base} in {r.quote}
                        </th>
                      ))}
                      <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                        <span className="sr-only">Status</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((t) => (
                      <tr key={t.id}>
                        <td className="px-5 py-3 sm:px-6">
                          {formatLongDate(t.publishedOn)}
                          <span className="block text-caption text-ink-muted">Fetched {formatMoment(t.fetchedAt, DEFAULT_TIME_ZONE)}</span>
                        </td>
                        {t.rates.map((r) => (
                          <td key={r.base} className="px-3 py-3 text-right tabular-nums">
                            {r.rateMicros === null ? "None" : microsToRate(r.rateMicros)}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-right sm:px-6">
                          {t.heldBack ? (
                            <span className="flex flex-col items-end gap-1">
                              <Badge tone="warning">Held back</Badge>
                              <span className="max-w-80 text-caption text-ink-muted">{t.heldBack}</span>
                              <AcceptRatesForm tableId={t.id} label={`Accept the table published ${formatLongDate(t.publishedOn)}`} />
                            </span>
                          ) : (
                            <Badge tone="positive">In use</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}

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
