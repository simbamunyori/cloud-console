import { Server } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DomainStatusBadge, ServiceStatusBadge } from "@/components/app/status";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import type { Service } from "@/server/billing/adapter";
import { requireBilling } from "@/server/billing/context";
import { monthlyPrice } from "@/server/billing/views";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const { billing } = await requireBilling();
  const [services, domains] = await Promise.all([billing.listServices(), billing.listDomains()]);
  const current = services.filter((s) => s.status !== "cancelled" && s.status !== "terminated");
  const ended = services.filter((s) => s.status === "cancelled" || s.status === "terminated");
  const groups = new Map<string, Service[]>();
  for (const s of current) groups.set(s.groupName, [...(groups.get(s.groupName) ?? []), s]);
  const liveDomains = domains.filter((d) => d.status !== "cancelled" && d.status !== "transferred_away");

  return (
    <>
      <PageHeader
        title="Services"
        description="Everything you have with us, what it costs each month and when it next renews."
        actions={
          <Button asChild>
            <Link href="/app/marketplace">Add a service</Link>
          </Button>
        }
      />
      {current.length === 0 && liveDomains.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No services yet"
          action={
            <Button asChild>
              <Link href="/app/marketplace">Browse the marketplace</Link>
            </Button>
          }
        >
          Email, servers, websites and backups you order will appear here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([group, items]) => (
            <Card key={group} aria-label={group}>
              <CardHeader title={group} />
              <ul className="divide-y divide-border">
                {items.map((s) => (
                  <li key={s.serviceId}>
                    <Link href={`/app/services/${s.serviceId}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink">{s.name}</span>
                        <span className="text-callout text-ink-muted">
                          {[s.quantity > 1 ? `${s.quantity} users` : null, s.domain, s.status === "active" ? `Renews ${formatDay(s.nextDueOn, true)}` : null].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-4 sm:justify-end">
                        <span className="text-callout text-ink-muted">
                          <Amount value={monthlyPrice(s)} className="text-ink" /> a month
                        </span>
                        <ServiceStatusBadge status={s.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <Card id="domains" aria-labelledby="domains-title">
            <CardHeader
              id="domains-title"
              title="Domains"
              description="Your web addresses. Renewals go on your monthly invoice when they fall due."
              action={
                <Link href="/app/marketplace/domains" className="text-callout text-link hover:underline">
                  Find a domain
                </Link>
              }
            />
            {liveDomains.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">No domains with us yet.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {liveDomains.map((d) => (
                  <li key={d.domainId} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-ink">{d.name}</span>
                      <span className="text-callout text-ink-muted">
                        Expires {formatDay(d.expiresOn, true)}, {d.autoRenew ? "renews on its own" : "doesn't renew on its own"}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className="text-callout text-ink-muted">
                        <Amount value={d.renewal} className="text-ink" /> a year
                      </span>
                      <DomainStatusBadge status={d.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {ended.length ? (
            <details className="rounded-lg border border-border bg-surface-1">
              <summary className="cursor-pointer px-5 py-4 text-callout font-semibold text-ink sm:px-6">Ended and cancelled ({ended.length})</summary>
              <ul className="divide-y divide-border border-t border-border">
                {ended.map((s) => (
                  <li key={s.serviceId}>
                    <Link href={`/app/services/${s.serviceId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 sm:px-6">
                      <span className="flex-1 text-ink">{s.name}</span>
                      <ServiceStatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </>
  );
}
