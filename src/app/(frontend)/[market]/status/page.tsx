import type { Metadata } from "next";
import { SitePage } from "@/components/site/site-page";
import { StatusDot } from "@/components/site/status-dot";
import { company } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { prisma } from "@/server/db";
import { siteMarket, siteMetadata } from "@/server/site/site";
import { IMPACT_LABEL, recentIncidents, serviceStatus } from "@/server/status/status";

type Props = { params: Promise<{ market: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  return siteMetadata(m.code, "/status", { title: `Service status | ${company.name}`, description: "Whether our services are working normally, and anything we are working on." });
}

/** The service status: what is affected now, and what was in the last 30 days. */
export default async function StatusPage({ params }: Props) {
  const m = await siteMarket((await params).market);
  const [status, recent] = await Promise.all([serviceStatus(prisma), recentIncidents(prisma)]);
  const when = (d: Date) => formatMoment(d, m.timeZone);
  return (
    <SitePage code={m.code} path="/status">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:py-16">
        <header className="flex flex-col gap-3">
          <p className="label-kicker text-link">Service status</p>
          <h1 className="flex items-center gap-3 text-title-1 text-ink sm:text-display">
            <StatusDot state={status.state} className="size-3" />
            {status.label}
          </h1>
          <p className="text-body text-ink-muted">Our team updates this page as soon as anything affects customers. Automatic checks also watch ordering and invoices.</p>
        </header>
        {status.open.length ? (
          <section aria-labelledby="now-title" className="flex flex-col gap-4">
            <h2 id="now-title" className="text-title-2 text-ink">
              Now
            </h2>
            <ul className="flex flex-col gap-3">
              {status.open.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 rounded-md border border-border bg-surface-1 p-5">
                  <span className="text-headline text-ink">{i.title}</span>
                  <span className="text-callout text-ink-muted">
                    {IMPACT_LABEL[i.impact]}, since {when(i.startedAt)}
                  </span>
                  {i.message ? <p className="mt-2 text-body text-ink-body">{i.message}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="past-title" className="flex flex-col gap-4">
          <h2 id="past-title" className="text-title-2 text-ink">
            The last 30 days
          </h2>
          {recent.length ? (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {recent.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 py-4">
                  <span className="font-semibold text-ink">{i.title}</span>
                  <span className="text-callout text-ink-muted">
                    {IMPACT_LABEL[i.impact]}, {when(i.startedAt)} to {when(i.resolvedAt!)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">No incidents.</p>
          )}
        </section>
      </div>
    </SitePage>
  );
}
