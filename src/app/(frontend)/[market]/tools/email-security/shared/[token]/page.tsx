import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/components/site/site-page";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { prisma } from "@/server/db";
import { siteMarket } from "@/server/site/site";
import { STATUS_WORD, type CheckStatus } from "@/server/tools/email-check";
import { sharedEmailReport } from "@/server/tools/results";

export const metadata: Metadata = { title: "Shared email security report", robots: { index: false, follow: false } };

const TONE: Record<CheckStatus, BadgeTone> = { pass: "positive", warn: "warning", fail: "negative", unknown: "neutral" };

/** A report someone chose to share from the free email security check (U9). */
export default async function SharedReportPage({ params }: { params: Promise<{ market: string; token: string }> }) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  const report = await sharedEmailReport(prisma, decodeURIComponent(token));
  if (!report) notFound();
  const open = report.checks.filter((c) => c.status === "fail" || c.status === "warn");
  return (
    <SitePage code={m.code} path="">
      <div className="page-container flex flex-col gap-8 py-12 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="label-kicker text-link">Shared email security report</p>
          <h1 className="text-title-1 text-ink sm:text-display">{report.domain}</h1>
          <p className="text-body text-ink-muted">
            Checked on {formatDay(report.checkedAt, true)} from public records. Someone shared this link with you; it works until {formatDay(report.expiresAt, true)}.
          </p>
        </header>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-6 sm:flex-row sm:items-center sm:justify-between xl:p-8">
          <p className="text-body text-ink-muted">{open.length ? `${open.length === 1 ? "One thing needs" : `${open.length} things need`} attention. Each one shows how to fix it.` : "Everything we checked was in order."}</p>
          <p className="flex items-baseline gap-1 text-ink">
            <span className="text-display tabular-nums">{report.score}</span>
            <span className="text-callout text-ink-muted">out of 100</span>
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {report.checks.map((c) => (
            <li key={c.key} className="flex flex-col gap-2 p-5 sm:flex-row sm:gap-6 xl:px-8">
              <div className="flex shrink-0 items-center justify-between gap-3 sm:w-56 sm:flex-col sm:items-start">
                <h2 className="text-headline text-ink">{c.title}</h2>
                <Badge tone={TONE[c.status as CheckStatus] ?? "neutral"}>{STATUS_WORD[c.status as CheckStatus] ?? c.status}</Badge>
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
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={`/${m.code}/tools/email-security?domain=${encodeURIComponent(report.domain)}`}>Check it again now</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={`/${m.code}/tools/email-security`}>Check your own domain</Link>
          </Button>
        </div>
      </div>
    </SitePage>
  );
}
