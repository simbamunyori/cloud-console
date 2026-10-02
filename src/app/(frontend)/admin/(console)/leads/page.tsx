import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import type { LeadSource } from "@prisma/client";
import { SHORT_SOURCE, SOURCE_LABEL } from "@/server/leads/sequences";
import { LEAD_KEEP_MONTHS, listLeads } from "@/server/sales/leads";
import { LeadStatusBadge } from "./status";

export const metadata: Metadata = { title: "Leads" };

const GROUPS = [
  { status: "NEW", title: "New", description: "Waiting for someone to get in touch. Read the conversation first." },
  { status: "CONTACTED", title: "Contacted", description: "Someone has been in touch. Close it when there is nothing more to do." },
  { status: "CLOSED", title: "Closed", description: "Finished." },
] as const;

const SOURCES = Object.keys(SOURCE_LABEL) as LeadSource[];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const { staff } = await requireStaffCan("viewCustomers");
  const asked = (await searchParams).source;
  const source = SOURCES.find((s) => s === asked);
  const leads = await listLeads(prisma, staff, "ALL", source);

  return (
    <>
      <PageHeader
        title="Leads"
        description={`Everyone who left their details on the website: Thapelo, the free tools, quote requests, newsletter sign-ups and booked calls, with where they came from and any campaign. Someone who comes back updates their lead. Leads are deleted ${LEAD_KEEP_MONTHS} months after they last changed.`}
      />
      <nav aria-label="Filter by source" className="mb-6 flex flex-wrap gap-2">
        {[undefined, ...SOURCES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/leads?source=${s}` : "/admin/leads"}
            aria-current={s === source ? "page" : undefined}
            className="rounded-sm border border-border-strong bg-surface-1 px-3 py-1.5 text-callout text-ink hover:bg-surface-2 aria-[current=page]:border-brand aria-[current=page]:bg-brand-soft aria-[current=page]:text-link"
          >
            {s ? SHORT_SOURCE[s] : "All"}
          </Link>
        ))}
      </nav>
      {leads.length === 0 ? (
        <Card>
          <EmptyState icon={MessagesSquare} title={source ? "No leads from here yet" : "No leads yet"}>
            When a visitor asks Thapelo for a person, uses a free tool with their email, asks for a quote or books a call, they appear here.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map((g) => {
            const group = leads.filter((l) => l.status === g.status);
            if (!group.length) return null;
            const id = `leads-${g.status.toLowerCase()}`;
            return (
              <Card key={g.status} aria-labelledby={id}>
                <CardHeader id={id} title={`${g.title} (${group.length})`} description={g.description} />
                <ul className="divide-y divide-border">
                  {group.map((l) => (
                    <li key={l.id}>
                      <Link href={`/admin/leads/${l.reference}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-semibold text-ink">
                            {l.name}
                            {l.company ? <span className="font-normal text-ink-muted">, {l.company}</span> : null}
                          </span>
                          <span className="truncate text-callout text-ink-muted">{l.need}</span>
                          <span className="text-caption text-ink-muted">
                            {l.reference} · {l.market.toUpperCase()} · {formatDay(l.updatedAt, true)}
                            {l.campaign ? ` · Campaign ${l.campaign}` : ""}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 self-start sm:self-center">
                          <Badge tone={l.source === "PERSON" || l.source === "BOOKING" ? "info" : "neutral"}>{SHORT_SOURCE[l.source]}</Badge>
                          <LeadStatusBadge status={l.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
