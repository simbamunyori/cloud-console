import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingForm } from "@/components/app/rating-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { company } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { ticketForCustomer } from "@/server/support/tickets";
import { rateAction, resolveAction } from "../../actions";
import { ReplyForm } from "../../forms";
import { TICKET_STATUS } from "../../labels";

export const metadata: Metadata = { title: "Ticket" };

const FROM = { CUSTOMER: "", STAFF: `${company.name} team`, ASSISTANT: "Assistant", SYSTEM: "" } as const;

export default async function TicketPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ new?: string; handover?: string }> }) {
  const [{ reference }, { new: isNew, handover }] = await Promise.all([params, searchParams]);
  const { db, actor, organisation } = await requireMember();
  const ticket = await ticketForCustomer(db, decodeURIComponent(reference));
  if (!ticket) notFound();
  const [label, tone] = TICKET_STATUS[ticket.status];
  const mayReply = can(actor, "support");
  const rating = ticket.status === "RESOLVED" && mayReply && (await featureOn(prisma, "service-standards"));

  return (
    <>
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Support
      </Link>
      <PageHeader eyebrow={`Ticket ${ticket.reference}`} title={ticket.subject} actions={<Badge tone={tone}>{label}</Badge>} />
      <div className="flex flex-col gap-6">
        {isNew ? <Alert tone="positive">Thanks, our team has it. We&apos;ll email you when we reply.</Alert> : null}
        {handover ? <Alert tone="positive">Our team has the whole conversation with the assistant, so you won&apos;t need to explain again. We&apos;ll email you when we reply.</Alert> : null}
        <ol className="flex flex-col gap-4">
          {ticket.messages.map((m) => {
            const ours = m.authorKind === "STAFF";
            return (
              <li key={m.id}>
                <Card className={cn(ours && "border-brand/30 bg-brand-soft/40")}>
                  <CardBody className="flex flex-col gap-2">
                    <span className="text-callout text-ink-muted">
                      <span className="font-semibold text-ink">{m.authorLabel}</span>
                      {FROM[m.authorKind] ? ` (${FROM[m.authorKind]})` : ""}, {formatMoment(m.createdAt, organisation.timeZone)}
                    </span>
                    <p className="text-body whitespace-pre-wrap text-ink-body">{m.body}</p>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>
        {rating ? (
          <Card aria-labelledby="rate-title">
            <CardHeader id="rate-title" title={ticket.rating ? "Thanks for your rating" : "How did we do?"} description={ticket.rating ? `You gave us ${ticket.rating} out of 5. You can change it for 30 days.` : "One question, so we know how our support is doing."} />
            <CardBody>
              <RatingForm action={rateAction} hidden={{ reference: ticket.reference }} score={ticket.rating ?? undefined} done={Boolean(ticket.rating)} />
            </CardBody>
          </Card>
        ) : null}
        {mayReply ? (
          <Card>
            <CardBody className="flex flex-col gap-4">
              <ReplyForm reference={ticket.reference} />
              {ticket.status !== "RESOLVED" ? (
                <form action={resolveAction} className="border-t border-border pt-4">
                  <input type="hidden" name="reference" value={ticket.reference} />
                  <Button type="submit" variant="ghost">
                    It&apos;s sorted, close this ticket
                  </Button>
                </form>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
