import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/site-page";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { formatMoney } from "@/lib/domain/money";
import { DomainError } from "@/server/org/access";
import { partnerLinks } from "@/server/site/partner-links";
import { productHref, siteMarket, siteMetadata, sitePrices } from "@/server/site/site";
import { matchingProducts, STATUS_WORD, type CheckStatus, type EmailReport } from "@/server/tools/email-check";
import { prisma } from "@/server/db";
import { resultsOn, SHARE_CONSENT } from "@/server/tools/results";
import { runEmailCheck, TOOL_CONSENT } from "@/server/tools/site-tools";
import { emailReportAction } from "../actions";
import { ToolLeadForm } from "../lead-form";
import { ShareReportForm } from "../share-form";

type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ domain?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const meta = await siteMetadata(m.code, "/tools/email-security", {
    title: `Free email security check | ${company.name}`,
    description: "Enter your domain and see in plain words whether your email can be faked: SPF, DKIM, DMARC, your website's certificate and your domain's renewal date, with the fix for each.",
  });
  // A report is for the person who asked; only the empty form is indexed.
  return (await searchParams).domain ? { ...meta, robots: { index: false, follow: true } } : meta;
}

const TONE: Record<CheckStatus, BadgeTone> = { pass: "positive", warn: "warning", fail: "negative", unknown: "neutral" };

/** The free email security check (final build, Milestone 8). */
export default async function EmailSecurityPage({ params, searchParams }: Props) {
  const m = await siteMarket((await params).market);
  const asked = (await searchParams).domain?.slice(0, 300) ?? "";
  let report: EmailReport | null = null;
  let error: string | null = null;
  if (asked.trim()) {
    try {
      report = await runEmailCheck(asked);
    } catch (e) {
      if (e instanceof DomainError) error = e.message;
      else throw e;
    }
  }
  const [{ bookingHref }, prices, sharing] = await Promise.all([partnerLinks(m.code), report ? sitePrices(m.code) : [], report ? resultsOn(prisma) : false]);
  const wanted = report ? matchingProducts(report) : [];
  const products = await Promise.all(prices.filter((p) => wanted.includes(p.slug)).map(async (p) => ({ ...p, href: await productHref(m.code, p) })));
  const open = report?.checks.filter((c) => c.status === "fail" || c.status === "warn") ?? [];

  return (
    <SitePage code={m.code} path="/tools/email-security">
      <div className="page-container flex flex-col gap-10 py-12 lg:gap-14 lg:py-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <header className="flex max-w-3xl flex-col gap-4">
              <p className="label-kicker text-link">Free email security check</p>
              <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">Can someone send email as you?</h1>
              <p className="text-body text-ink-muted xl:text-headline xl:font-normal">Enter your domain. We read its public records and tell you, in plain words, what is protected and what to fix.</p>
            </header>
            <form method="get" role="search" aria-label="Check a domain" className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label htmlFor="domain" className="text-callout font-semibold text-ink">
                  Your domain
                </label>
                <input
                  id="domain"
                  name="domain"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="yourcompany.co.bw"
                  defaultValue={asked}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? "domain-error" : undefined}
                  className="h-12.5 rounded-sm border border-border-strong bg-surface-0 px-4 text-body text-ink placeholder:text-ink-muted"
                />
              </div>
              <Button type="submit" size="lg">
                Check my domain
              </Button>
            </form>
            {error ? (
              <p id="domain-error" role="alert" className="text-callout text-negative">
                {error}
              </p>
            ) : null}
          </div>
          <aside aria-labelledby="what-title" className="flex h-fit shrink-0 flex-col gap-3 rounded-lg bg-surface-2 p-6 lg:w-96 xl:w-104">
            <h2 id="what-title" className="text-headline text-ink">
              What we check
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-callout text-ink-body">
              <li>Mail servers (MX)</li>
              <li>SPF, which lists who may send as you</li>
              <li>DKIM signatures, under the common names</li>
              <li>DMARC, which tells others what to do with fakes</li>
              <li>Your website&apos;s certificate</li>
              <li>When your domain is due for renewal</li>
            </ul>
            <p className="text-caption text-ink-muted">Public records only. We don&apos;t scan your servers or log in anywhere.</p>
          </aside>
        </div>

        {report ? (
          <section aria-labelledby="report-title" className="flex flex-col gap-8">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-6 sm:flex-row sm:items-center sm:justify-between xl:p-8">
              <div className="flex flex-col gap-1">
                <h2 id="report-title" className="text-title-2 text-ink">
                  Report for {report.domain}
                </h2>
                <p className="text-body text-ink-muted">
                  {open.length ? `${open.length === 1 ? "One thing needs" : `${open.length} things need`} attention. Each one shows how to fix it.` : "Everything we check is in order."}
                </p>
              </div>
              <p className="flex items-baseline gap-1 text-ink">
                <span className="text-display tabular-nums">{report.score}</span>
                <span className="text-callout text-ink-muted">out of 100</span>
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {report.checks.map((c) => (
                <li key={c.key} className="flex flex-col gap-2 p-5 sm:flex-row sm:gap-6 xl:px-8">
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:w-56 sm:flex-col sm:items-start">
                    <h3 className="text-headline text-ink">{c.title}</h3>
                    <Badge tone={TONE[c.status]}>{STATUS_WORD[c.status]}</Badge>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-body text-ink">{c.finding}</p>
                    {c.fix ? (
                      <p className="text-callout text-ink-muted">
                        <span className="font-semibold text-ink">What to do: </span>
                        {c.fix}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {products.length || bookingHref ? (
              <section aria-labelledby="help-title" className="flex flex-col gap-5">
                <h2 id="help-title" className="text-title-2 text-ink">
                  {open.length ? "We can fix it for you" : "Keep it that way"}
                </h2>
                {products.length ? (
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {products.map((p) => (
                      <li key={p.slug} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-5">
                        <p className="text-headline text-ink">{p.name}</p>
                        <p className="flex-1 text-callout text-ink-muted">{p.summary}</p>
                        <p className="text-callout text-ink">
                          From <span className="font-semibold tabular-nums">{formatMoney(p.price, m.locale)}</span> {p.unitLabel} a month
                        </p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                          <Link href={`/sign-up?next=${encodeURIComponent(`/app/marketplace/${p.slug}`)}`} className="text-callout font-semibold text-link hover:underline">
                            Order
                          </Link>
                          <Link href={p.href} className="inline-flex items-center gap-1 text-callout text-link hover:underline">
                            Read more <ArrowRight aria-hidden className="size-4" />
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  {bookingHref ? (
                    <Button asChild size="lg">
                      <Link href={`${bookingHref}?topic=email-check`}>Go through it with an engineer</Link>
                    </Button>
                  ) : null}
                  <Button asChild size="lg" variant="secondary">
                    <Link href={`/${m.code}/quote`}>Ask for a quote</Link>
                  </Button>
                </div>
              </section>
            ) : null}

            <ToolLeadForm
              action={emailReportAction}
              hidden={[
                ["market", m.code],
                ["domain", report.domain],
              ]}
              heading="Email me this report"
              text="With the fixes, so you can pass it to whoever looks after your DNS."
              button="Email me the report"
              consent={TOOL_CONSENT}
              privacyHref={`/${m.code}/legal/privacy`}
            />
            {sharing ? <ShareReportForm market={m.code} domain={report.domain} consent={SHARE_CONSENT} /> : null}
          </section>
        ) : null}
      </div>
    </SitePage>
  );
}
