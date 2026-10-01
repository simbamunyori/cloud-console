import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { formatMoney } from "@/lib/domain/money";
import { partnerLinks } from "@/server/site/partner-links";
import { siteMarket, siteMetadata, taxNote } from "@/server/site/site";
import { estimate, MAX_USERS, NEEDS, parseNeeds, parseUsers, PROVIDER_LABEL, type PricedPlan, type Provider } from "@/server/tools/calculator";
import { calculatorPrices, TOOL_CONSENT } from "@/server/tools/site-tools";
import { emailEstimateAction } from "../actions";
import { ToolLeadForm } from "../lead-form";

type Search = { users?: string; provider?: string; need?: string | string[] };
type Props = { params: Promise<{ market: string }>; searchParams: Promise<Search> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const meta = await siteMetadata(m.code, "/tools/cost-calculator", {
    title: `Microsoft 365 and Google Workspace cost calculator | ${company.name}`,
    description: `Tell us how many people and what they need. See the right Microsoft 365 or Google Workspace plan and the monthly total in ${m.currency}, at this month's prices.`,
  });
  return (await searchParams).users ? { ...meta, robots: { index: false, follow: true } } : meta;
}

const PROVIDERS: Provider[] = ["either", "microsoft", "google"];
const orderPath = (p: PricedPlan, users: number) => `/app/marketplace/${p.slug}?quantity=${users}`;

/** The Microsoft 365 and Google Workspace cost calculator (final build, Milestone 8). */
export default async function CostCalculatorPage({ params, searchParams }: Props) {
  const m = await siteMarket((await params).market);
  const q = await searchParams;
  const provider = (PROVIDERS.includes(q.provider as Provider) ? q.provider : "either") as Provider;
  const needs = parseNeeds([q.need ?? []].flat());
  const users = parseUsers(q.users);
  const [prices, { bookingHref }] = await Promise.all([calculatorPrices(m.code), partnerLinks(m.code)]);
  const result = users ? estimate({ users, provider, needs }, prices) : null;
  const note = taxNote(m);
  const offered = new Set(prices.map((p) => p.slug.split("-")[0]));

  return (
    <SitePage code={m.code} path="/tools/cost-calculator">
      <div className="page-container flex flex-col gap-10 py-12 lg:gap-14 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-4">
          <p className="label-kicker text-link">Cost calculator</p>
          <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">What would it cost each month?</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">
            Microsoft 365 or Google Workspace, for your number of people and what they need, at this month&apos;s prices in {m.currency}.
          </p>
        </header>

        {prices.length === 0 ? (
          <p className="max-w-3xl text-body text-ink">
            Microsoft 365 and Google Workspace aren&apos;t on sale online here yet.{" "}
            <Link href={`/${m.code}/quote`} className="font-semibold text-link hover:underline">
              Ask us for a quote
            </Link>{" "}
            and we&apos;ll price it for you.
          </p>
        ) : (
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
            <form method="get" aria-label="Your team" className="flex min-w-0 flex-1 flex-col gap-7">
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-headline text-ink">Which do you prefer?</legend>
                <div className="flex flex-wrap gap-3">
                  {PROVIDERS.filter((p) => p === "either" || offered.has(p)).map((p) => (
                    <label
                      key={p}
                      className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-border-strong bg-surface-0 px-4 py-3 text-body text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                    >
                      <input type="radio" name="provider" value={p} defaultChecked={p === provider} className="size-4 accent-brand" />
                      {p === "either" ? "Either, show me the best fit" : PROVIDER_LABEL[p]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex max-w-xs flex-col gap-1.5">
                <label htmlFor="users" className="text-headline text-ink">
                  How many people need an account?
                </label>
                <input
                  id="users"
                  name="users"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  required
                  defaultValue={q.users ?? "10"}
                  aria-describedby="users-hint"
                  className="h-12.5 rounded-sm border border-border-strong bg-surface-0 px-4 text-body text-ink tabular-nums"
                />
                <p id="users-hint" className="text-callout text-ink-muted">
                  Shared mailboxes like info@ are free.
                </p>
              </div>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-headline text-ink">What do they need, besides email, video calls and documents?</legend>
                {NEEDS.map((n) => (
                  <label key={n.key} className="flex items-start gap-3 text-body text-ink">
                    <input type="checkbox" name="need" value={n.key} defaultChecked={needs.includes(n.key)} className="mt-1 size-4 shrink-0 accent-brand" />
                    <span className="flex flex-col">
                      {n.label}
                      <span className="text-callout text-ink-muted">{n.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <Button type="submit" size="lg">
                  Work out my cost
                </Button>
              </div>
            </form>

            <section
              aria-labelledby="result-title"
              aria-live="polite"
              className="flex h-fit shrink-0 flex-col gap-5 rounded-lg border border-border bg-surface-1 p-6 lg:sticky lg:top-24 lg:w-96 xl:w-112 xl:p-8"
            >
              <h2 id="result-title" className="text-headline text-ink">
                {result?.plan ? "We recommend" : "Your estimate"}
              </h2>
              {!result ? (
                <p className="text-body text-ink-muted">Fill in your team on the left and press Work out my cost.</p>
              ) : !result.plan ? (
                <>
                  <p className="text-body text-ink">{result.note}</p>
                  <Button asChild size="lg">
                    <Link href={`/${m.code}/quote`}>Ask for a quote</Link>
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <p className="text-title-2 text-ink">{result.plan.name}</p>
                    <p className="text-callout text-ink-muted">{result.why}</p>
                  </div>
                  <p className="flex flex-col text-callout text-ink-muted">
                    <span className="text-display text-ink tabular-nums">{formatMoney(result.plan.total, m.locale)}</span>a month for {result.users} {result.users === 1 ? "person" : "people"},{" "}
                    {formatMoney(result.plan.unit, m.locale)} each
                  </p>
                  {note ? <p className="text-caption text-ink-muted">{note}</p> : null}
                  <div className="flex flex-col gap-3">
                    <Button asChild size="lg">
                      <Link href={`/sign-up?next=${encodeURIComponent(orderPath(result.plan, result.users))}`}>Order {result.plan.name.replace(/^(Microsoft 365|Google Workspace) /, "")}</Link>
                    </Button>
                    <p className="text-center text-callout text-ink-muted">
                      Have an account?{" "}
                      <Link href={`/sign-in?next=${encodeURIComponent(orderPath(result.plan, result.users))}`} className="font-semibold text-link hover:underline">
                        Sign in to order
                      </Link>
                    </p>
                  </div>
                  {result.alternative ? (
                    <p className="border-t border-border pt-4 text-callout text-ink-muted">
                      Or {result.alternative.name}: <span className="font-semibold text-ink tabular-nums">{formatMoney(result.alternative.total, m.locale)}</span> a month.
                    </p>
                  ) : null}
                  {bookingHref ? (
                    <Link href={`${bookingHref}?topic=cost-calculator`} className="text-callout font-semibold text-link hover:underline">
                      Talk it through with a pre-sales engineer
                    </Link>
                  ) : null}
                </>
              )}
            </section>
          </div>
        )}

        {result?.plan ? (
          <div className="max-w-3xl">
            <ToolLeadForm
              action={emailEstimateAction}
              hidden={[["market", m.code], ["users", String(result.users)], ["provider", provider], ...needs.map((n): [string, string] => ["need", n])]}
              heading="Email me this estimate"
              text="To share with whoever signs off on it. We'll add how moving your email works."
              button="Email me the estimate"
              consent={TOOL_CONSENT}
              privacyHref={`/${m.code}/legal/privacy`}
            />
          </div>
        ) : null}
        {users === null && q.users ? <p className="text-callout text-negative">Enter a number of people from 1 to {MAX_USERS}, or ask for a quote for more.</p> : null}
      </div>
    </SitePage>
  );
}
