import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitePage } from "@/components/site/site-page";
import { Badge } from "@/components/ui/badge";
import { formatDay, formatMonth } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { prisma } from "@/server/db";
import { partnerDashboard, percentOf } from "@/server/referrals/referrals";
import { siteMarket } from "@/server/site/site";
import { siteUrl } from "@/server/site/urls";
import { PayoutDetailsForm } from "../forms";

export const metadata: Metadata = { title: "Your referral dashboard", robots: { index: false, follow: false } };

const STATEMENT = { NIL: ["Nothing due", "neutral"], DUE: ["To be paid", "warning"], PAID: ["Paid", "positive"] } as const;

/** A referral partner's dashboard (U9), opened with the private link in their welcome email. */
export default async function PartnerDashboardPage({ params }: { params: Promise<{ market: string; token: string }> }) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  const d = await partnerDashboard(prisma, decodeURIComponent(token));
  if (!d) notFound();
  const link = `${siteUrl()}/${d.partner.market}?ref=${d.partner.code}`;
  const owed = d.statements.filter((s) => s.status === "DUE");
  return (
    <SitePage code={m.code} path="">
      <div className="page-container flex flex-col gap-10 py-12 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="label-kicker text-link">Referral partner dashboard</p>
          <h1 className="text-title-1 text-ink sm:text-display">{d.partner.company}</h1>
          <p className="text-body text-ink-muted">
            You earn {percentOf(d.partner.commissionBps)} of what your customers pay us each month.{d.partner.status === "PAUSED" ? " Your partnership is paused, so new sign-ups through your link don't count for now." : ""} Keep this page&apos;s address private.
          </p>
        </header>

        <section aria-labelledby="link-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <h2 id="link-title" className="text-headline text-ink">
            Your referral link
          </h2>
          <p className="rounded-md bg-surface-2 px-3 py-2 font-mono text-callout break-all text-ink">{link}</p>
          <p className="text-callout text-ink-muted">Anyone who signs up within 90 days of clicking it counts as your customer. It works on any page of our site: add ?ref={d.partner.code} to the address.</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="customers-title" className="flex flex-col gap-3">
            <h2 id="customers-title" className="text-title-2 text-ink">
              Your customers ({d.customers.length})
            </h2>
            {d.customers.length ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-1">
                {d.customers.map((c, i) => (
                  <li key={i} className="flex justify-between gap-3 px-5 py-3 text-callout">
                    <span className="text-ink">{c.name}</span>
                    <span className="text-ink-muted">since {formatDay(c.since, true)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-callout text-ink-muted">No one has signed up through your link yet.</p>
            )}
          </section>

          <section aria-labelledby="statements-title" className="flex flex-col gap-3">
            <h2 id="statements-title" className="text-title-2 text-ink">
              Statements
            </h2>
            {d.statements.length ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-1">
                {d.statements.map((s) => {
                  const [label, tone] = STATEMENT[s.status];
                  return (
                    <li key={s.id} className="flex flex-col gap-1 px-5 py-3 text-callout sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-ink">
                        {formatMonth(new Date(`${s.month}-01T00:00:00Z`))}: {formatMoney(money(s.commissionMinor, s.currency), "en-BW")}
                        <span className="text-ink-muted"> on {formatMoney(money(s.paidInMinor, s.currency), "en-BW")} paid</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {s.paidAt ? <span className="text-caption text-ink-muted">{formatDay(s.paidAt, true)}</span> : null}
                        <Badge tone={tone}>{label}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-callout text-ink-muted">Your first statement comes early next month.</p>
            )}
          </section>
        </div>

        <section aria-labelledby="bank-title" className="flex max-w-2xl flex-col gap-3">
          <h2 id="bank-title" className="text-title-2 text-ink">
            Where we pay you
          </h2>
          {owed.length && !d.partner.hasPayoutDetails ? <p className="text-callout text-warning">Commission is waiting. Add your bank details so we can pay it.</p> : null}
          <PayoutDetailsForm market={m.code} token={decodeURIComponent(token)} saved={d.partner.hasPayoutDetails} />
        </section>
      </div>
    </SitePage>
  );
}
