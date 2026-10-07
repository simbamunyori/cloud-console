import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/domain/money";
import { requireBilling } from "@/server/billing/context";
import { includedWords } from "@/server/catalogue/inclusions";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { estimate, MAX_USERS, NEEDS, parseNeeds, parseUsers, PLANS, PROVIDER_LABEL, type Provider } from "@/server/tools/calculator";
import { calculatorPrices } from "@/server/tools/site-tools";

export const metadata: Metadata = { title: "Which plan fits?" };

type Search = { users?: string; provider?: string; need?: string | string[] };
const PROVIDERS: Provider[] = ["either", "microsoft", "google"];

/**
 * The plan recommender (STRATEGY_ROLLOUT U11): the same logic as the
 * website's cost calculator and Thapelo, at the customer's own market's
 * prices, with what they already have in mind.
 */
export default async function RecommendPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await featureOn(prisma, "plan-recommender"))) notFound();
  const { billing, organisation, locale } = await requireBilling();
  const q = await searchParams;
  const provider = (PROVIDERS.includes(q.provider as Provider) ? q.provider : "either") as Provider;
  const needs = parseNeeds([q.need ?? []].flat());
  const users = parseUsers(q.users);
  const [prices, services] = await Promise.all([calculatorPrices(organisation.billingMarket), billing.listServices()]);
  const planIds = await prisma.product.findMany({ where: { slug: { in: PLANS.map((p) => p.slug) }, billingProductId: { not: null } }, select: { name: true, billingProductId: true } });
  const current = services.filter((s) => s.status === "active" && planIds.some((p) => p.billingProductId === s.productId));
  const result = users ? estimate({ users, provider, needs }, prices) : null;
  const offered = new Set(prices.map((p) => p.slug.split("-")[0]));
  const orderPath = (slug: string, n: number) => `/app/marketplace/${slug}?quantity=${n}`;

  return (
    <>
      <PageHeader eyebrow="Marketplace" title="Which plan fits?" description="Tell us how many people need an account and what they need. We'll show the Microsoft 365 or Google Workspace plan that covers it for the lowest price." />
      {current.length ? (
        <p className="mb-6 text-callout text-ink-muted">
          You already have {current.map((s) => `${s.name}${s.quantity > 1 ? ` for ${s.quantity} people` : ""}`).join(" and ")}. To add people, change the count in{" "}
          <Link href="/app/services" className="font-semibold text-link hover:underline">
            Services
          </Link>
          .
        </p>
      ) : null}
      {prices.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-ink">
              Microsoft 365 and Google Workspace aren&apos;t on sale online in your market yet.{" "}
              <Link href="/app/quotes/new" className="font-semibold text-link hover:underline">
                Ask us for a quote
              </Link>{" "}
              and we&apos;ll price it for you.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <Card className="min-w-0 flex-1">
            <CardBody>
              <form method="get" aria-label="Your team" className="flex flex-col gap-6">
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-headline text-ink">Which do you prefer?</legend>
                  <div className="flex flex-wrap gap-3">
                    {PROVIDERS.filter((p) => p === "either" || offered.has(p)).map((p) => (
                      <label key={p} className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-border-strong bg-surface-0 px-4 py-3 text-body text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
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
                  <input id="users" name="users" type="number" inputMode="numeric" min={1} max={10000} required defaultValue={q.users ?? ""} aria-describedby="users-hint" className="h-12 rounded-md border border-border-strong bg-surface-0 px-4 text-body text-ink tabular-nums" />
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
                  <Button type="submit">Show me the plan</Button>
                </div>
                {users === null && q.users ? <p className="text-callout text-negative">Enter a number of people from 1 to {MAX_USERS}, or ask for a quote for more.</p> : null}
              </form>
            </CardBody>
          </Card>

          <section aria-labelledby="result-title" aria-live="polite" className="flex h-fit shrink-0 flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5 sm:p-6 lg:sticky lg:top-24 lg:w-96">
            <h2 id="result-title" className="text-headline text-ink">
              {result?.plan ? "We recommend" : "Your plan"}
            </h2>
            {!result ? (
              <p className="text-ink-muted">Answer the questions and press Show me the plan.</p>
            ) : !result.plan ? (
              <>
                <p className="text-ink">{result.note}</p>
                <Button asChild>
                  <Link href="/app/quotes/new">Ask for a quote</Link>
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-title-2 text-ink">{result.plan.name}</p>
                  <p className="text-callout text-ink-muted">{result.why}</p>
                  {result.plan.included.length ? <p className="text-callout text-ink">Includes {includedWords(result.plan.included)} at no extra charge.</p> : null}
                </div>
                <p className="flex flex-col text-callout text-ink-muted">
                  <span className="text-title-1 font-bold text-ink tabular-nums">{formatMoney(result.plan.total, locale)}</span>a month for {result.users} {result.users === 1 ? "person" : "people"}, {formatMoney(result.plan.unit, locale)} each
                </p>
                <Button asChild>
                  <Link href={orderPath(result.plan.slug, result.users)}>Order {result.plan.name}</Link>
                </Button>
                {result.alternative ? (
                  <p className="border-t border-border pt-4 text-callout text-ink-muted">
                    Or{" "}
                    <Link href={orderPath(result.alternative.slug, result.users)} className="font-semibold text-link hover:underline">
                      {result.alternative.name}
                    </Link>
                    : <span className="font-semibold text-ink tabular-nums">{formatMoney(result.alternative.total, locale)}</span> a month.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
