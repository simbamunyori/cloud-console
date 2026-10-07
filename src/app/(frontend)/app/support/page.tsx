import { MessageCircleQuestion, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResponseTimes } from "@/components/app/response-times";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { assistantModel } from "@/server/support/assistant/model";
import { prisma } from "@/server/db";
import { ticketsForCustomer } from "@/server/support/tickets";
import { publishedResponseTimes } from "@/server/units/units";
import { TICKET_STATUS } from "./labels";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const { db, actor, organisation } = await requireMember();
  const [tickets, times] = await Promise.all([ticketsForCustomer(db), publishedResponseTimes(prisma)]);
  const assistantOn = assistantModel() !== null;
  const mayAsk = can(actor, "support");

  return (
    <>
      <PageHeader
        title="Support"
        description="Ask the assistant about your services and invoices, or ask our team."
        actions={
          mayAsk ? (
            <Button asChild variant="secondary">
              <Link href="/app/support/new">
                <Plus aria-hidden /> Ask our team
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-link">
              <Sparkles aria-hidden className="size-6" />
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <h2 className="text-headline text-ink">Ask the assistant</h2>
              <p className="text-callout text-ink-muted">
                {assistantOn
                  ? "It can look up your services, invoices, orders and tickets, explain charges, and set up changes for you to confirm. It can pass you to our team at any point."
                  : "The assistant isn't switched on yet. Our team is here to help in the meantime."}
              </p>
            </div>
            {assistantOn && mayAsk ? (
              <Button asChild>
                <Link href="/app/support/assistant">Start</Link>
              </Button>
            ) : null}
          </CardBody>
        </Card>

        <Card aria-labelledby="tickets-title">
          <CardHeader id="tickets-title" title="Your tickets" />
          {tickets.length === 0 ? (
            <CardBody className="flex items-center gap-3">
              <MessageCircleQuestion aria-hidden className="size-5 text-ink-muted" />
              <p className="text-ink-muted">No tickets yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {tickets.map((t) => {
                const [label, tone] = TICKET_STATUS[t.status];
                return (
                  <li key={t.id}>
                    <Link href={`/app/support/tickets/${t.reference}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold text-ink">{t.subject}</span>
                        <span className="truncate text-callout text-ink-muted tabular-nums">
                          {t.reference}, updated {formatMoment(t.updatedAt, organisation.timeZone)}
                        </span>
                      </span>
                      <Badge tone={tone}>{label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {times ? <ResponseTimes data={times} /> : null}
      </div>
    </>
  );
}
