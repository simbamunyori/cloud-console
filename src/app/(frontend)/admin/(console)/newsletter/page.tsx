import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireWebsiteStaff } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { itemsOf, listIssues, monthName } from "@/server/newsletter/issues";
import { PrepareForm } from "./forms";

export const metadata: Metadata = { title: "Newsletter" };

export default async function NewsletterPage() {
  const { actor } = await requireWebsiteStaff();
  const [issues, subscribers] = await Promise.all([
    listIssues(prisma, actor),
    prisma.newsletterSubscriber.groupBy({ by: ["marketCode"], where: { confirmedAt: { not: null }, unsubscribedAt: null }, _count: { _all: true } }),
  ]);
  const total = subscribers.reduce((n, s) => n + s._count._all, 0);
  return (
    <>
      <PageHeader
        title="Newsletter"
        description="The monthly insights email. On the 1st, an issue is prepared for each market from the insights published there the month before. A website Publisher checks it and sends it to confirmed subscribers."
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="subscribers-title">
          <CardHeader id="subscribers-title" title="Subscribers" description="Confirmed by email and not unsubscribed." />
          <CardBody className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="All markets">{total}</Stat>
              {subscribers.map((s) => (
                <Stat key={s.marketCode} label={s.marketCode.toUpperCase()}>
                  {s._count._all}
                </Stat>
              ))}
            </div>
            <PrepareForm />
          </CardBody>
        </Card>
        {issues.length === 0 ? (
          <Card>
            <EmptyState icon={Mail} title="No issues yet">
              The first issue is prepared on the 1st of the month after insights are published.
            </EmptyState>
          </Card>
        ) : (
          <Card aria-labelledby="issues-title">
            <CardHeader id="issues-title" title="Issues" />
            <ul className="divide-y divide-border">
              {issues.map((i) => (
                <li key={i.id}>
                  <Link href={`/admin/newsletter/${i.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-ink">{i.subject}</span>
                      <span className="text-caption text-ink-muted">
                        {monthName(i.month)} · {i.market.toUpperCase()} · {itemsOf(i.items).length} articles
                        {i.status === "SENT" ? ` · sent to ${i.recipients}` : ""}
                      </span>
                    </span>
                    <span className="self-start sm:self-center">{i.status === "SENT" ? <Badge tone="positive">Sent</Badge> : <Badge tone="warning">Draft</Badge>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
