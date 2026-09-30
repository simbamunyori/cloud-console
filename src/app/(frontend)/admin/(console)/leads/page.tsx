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
import { LEAD_KEEP_MONTHS, listLeads } from "@/server/sales/leads";
import { LeadStatusBadge } from "./status";

export const metadata: Metadata = { title: "Leads" };

const GROUPS = [
  { status: "NEW", title: "New", description: "Waiting for someone to get in touch. Read the conversation first." },
  { status: "CONTACTED", title: "Contacted", description: "Someone has been in touch. Close it when there is nothing more to do." },
  { status: "CLOSED", title: "Closed", description: "Finished." },
] as const;

export default async function LeadsPage() {
  const { staff } = await requireStaffCan("viewCustomers");
  const leads = await listLeads(prisma, staff, "ALL");

  return (
    <>
      <PageHeader
        title="Leads"
        description={`Visitors who asked Thapelo, the website's assistant, for a person, or left their details for us to get back to them. Each one comes with the conversation. Leads are deleted ${LEAD_KEEP_MONTHS} months after they last changed.`}
      />
      {leads.length === 0 ? (
        <Card>
          <EmptyState icon={MessagesSquare} title="No leads yet">
            When a visitor asks Thapelo for a person, their details and the conversation appear here, and the market&apos;s support address gets an email.
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
                            {l.reference} · {l.market.toUpperCase()} · {formatDay(l.createdAt, true)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 self-start sm:self-center">
                          {l.source === "PERSON" ? <Badge tone="info">Asked for a person</Badge> : null}
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
