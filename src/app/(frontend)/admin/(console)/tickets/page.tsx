import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { ticketQueue } from "@/server/support/tickets";

export const metadata: Metadata = { title: "Tickets" };

const STATUS = { OPEN: ["Needs us", "warning"], WAITING_ON_CUSTOMER: ["Waiting on customer", "neutral"], RESOLVED: ["Sorted", "positive"] } as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaffCan("viewCustomers");
  const { show } = await searchParams;
  const resolved = show === "resolved";
  const tickets = await ticketQueue(prisma, resolved ? "resolved" : "open");
  return (
    <>
      <PageHeader title="Tickets" description="Oldest first, so nobody waits longest. Tickets passed on by the assistant carry the whole conversation." />
      <nav aria-label="Filter" className="mb-6 flex gap-2">
        {[
          ["Open", "/admin/tickets", !resolved],
          ["Sorted", "/admin/tickets?show=resolved", resolved],
        ].map(([label, href, active]) => (
          <Link key={String(label)} href={String(href)} aria-current={active ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-callout font-semibold", active ? "bg-navy text-on-navy" : "bg-surface-2 text-ink hover:bg-border")}>
            {label}
          </Link>
        ))}
      </nav>
      {tickets.length === 0 ? (
        <EmptyState icon={Inbox} title="No tickets here" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {tickets.map((t) => {
              const [label, tone] = STATUS[t.status];
              return (
                <li key={t.id}>
                  <Link href={`/admin/tickets/${t.reference}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold text-ink">{t.subject}</span>
                      <span className="truncate text-callout text-ink-muted">
                        {t.organisation.name}, <span className="tabular-nums">{t.reference}</span>, {formatMoment(t.updatedAt, DEFAULT_TIME_ZONE)}
                        {t.assignee ? `, ${t.assignee.name}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Badge tone={tone}>{label}</Badge>
                      {t.conversationId ? <Badge tone="info">From assistant</Badge> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
