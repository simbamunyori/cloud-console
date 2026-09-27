import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { staffCan } from "@/server/staff/access";
import { ticketForStaff } from "@/server/support/tickets";
import { StaffReplyForm } from "../../forms";

export const metadata: Metadata = { title: "Ticket" };

export default async function StaffTicketPage({ params }: { params: Promise<{ reference: string }> }) {
  const { staff } = await requireStaffCan("viewCustomers");
  const { reference } = await params;
  const ticket = await ticketForStaff(prisma, decodeURIComponent(reference));
  if (!ticket) notFound();
  const tz = ticket.organisation.timeZone;

  return (
    <>
      <Link href="/admin/tickets" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Tickets
      </Link>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/admin/customers/${ticket.organisation.id}`} className="text-link hover:underline">
              {ticket.organisation.name}
            </Link>
            , ticket {ticket.reference}
          </>
        }
        title={ticket.subject}
      />
      <div className="flex flex-col gap-6">
        <ol className="flex flex-col gap-4">
          {ticket.messages.map((m) => (
            <li key={m.id}>
              <Card className={cn(m.internal && "border-warning/40 bg-warning-soft/40", m.authorKind === "STAFF" && !m.internal && "border-brand/30 bg-brand-soft/40")}>
                <CardBody className="flex flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-2 text-callout text-ink-muted">
                    <span className="font-semibold text-ink">{m.authorLabel}</span>
                    {m.authorKind === "STAFF" ? "(staff)" : "(customer)"}, {formatMoment(m.createdAt, tz)}
                    {m.internal ? <Badge tone="warning">Team note</Badge> : null}
                  </span>
                  <p className="text-body whitespace-pre-wrap text-ink-body">{m.body}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>

        {ticket.conversation ? (
          <Card aria-labelledby="conv-title">
            <CardHeader id="conv-title" title="Conversation with the assistant" description="Everything said before the customer asked for a person, with what the assistant looked up." />
            <ol className="divide-y divide-border">
              {ticket.conversation.messages.map((m) => {
                const looked = Array.isArray(m.toolTrace) ? (m.toolTrace as { summary?: string }[]).map((t) => t.summary).filter(Boolean) : [];
                return (
                  <li key={m.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                    <span className="text-callout font-semibold text-ink">{m.role === "USER" ? "Customer" : "Assistant"}</span>
                    <p className="text-callout whitespace-pre-wrap text-ink-body">{m.text}</p>
                    {looked.length ? <p className="text-caption text-ink-muted">Looked up: {looked.join("; ")}</p> : null}
                  </li>
                );
              })}
              {ticket.conversation.actions.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                  <span className="text-callout font-semibold text-ink">Suggested: {a.status.toLowerCase()}</span>
                  <p className="text-callout text-ink-body">{a.summary}</p>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {staffCan(staff, "answerTickets") ? (
          <Card>
            <CardBody>
              <StaffReplyForm reference={ticket.reference} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
