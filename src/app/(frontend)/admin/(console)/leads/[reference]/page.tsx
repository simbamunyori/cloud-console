import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatDay, formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { STOPPED_WORDS } from "@/server/leads/capture";
import { SEQUENCES, SOURCE_LABEL } from "@/server/leads/sequences";
import { leadForStaff } from "@/server/sales/leads";
import { Badge } from "@/components/ui/badge";
import { LeadStatusForm, StopFollowUpsForm } from "../forms";
import { LeadStatusBadge } from "../status";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { staff } = await requireStaffCan("viewCustomers");
  const found = await leadForStaff(prisma, staff, reference);
  if (!found) notFound();
  const { lead, conversation } = found;
  const handler = lead.handledById ? await prisma.user.findUnique({ where: { id: lead.handledById }, select: { name: true, email: true } }) : null;
  const tz = DEFAULT_TIME_ZONE;

  return (
    <>
      <Link href="/admin/leads" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Leads
      </Link>
      <PageHeader eyebrow={`Lead ${lead.reference}`} title={lead.company ? `${lead.name}, ${lead.company}` : lead.name} actions={<LeadStatusBadge status={lead.status} />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          {found.result ? (
            <Card aria-labelledby="lead-result">
              <CardHeader id="lead-result" title={found.result.title} description="What the tool showed them, as they saw it." />
              <CardBody className="flex flex-col gap-2">
                {found.result.rows.map(([k, v], i) => (
                  <p key={i} className="text-callout text-ink">
                    <span className="font-semibold">{k}: </span>
                    {v}
                  </p>
                ))}
              </CardBody>
            </Card>
          ) : null}
          {lead.bookings.length ? (
            <Card aria-labelledby="lead-calls">
              <CardHeader id="lead-calls" title="Pre-sales calls" />
              <ul className="divide-y divide-border">
                {lead.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6">
                    <span className="text-callout text-ink">
                      {formatMoment(b.startsAt, b.engineer.timeZone)} with {b.engineer.user.name}
                      <span className="text-ink-muted"> · {b.reference}</span>
                    </span>
                    {b.status === "CANCELLED" ? <Badge>Cancelled</Badge> : <Badge tone="info">Booked</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card aria-labelledby="lead-chat">
            <CardHeader id="lead-chat" title="The conversation" description={conversation.length ? "What the visitor asked Thapelo, and what Thapelo looked up to answer." : "No chat with Thapelo."} />
            {conversation.length ? (
              <ol className="flex flex-col gap-4 px-5 py-5 sm:px-6">
                {conversation.map((m, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <span className="text-caption font-semibold text-ink-muted">{m.from}</span>
                    <p className="text-body whitespace-pre-line text-ink">{m.text}</p>
                    {m.looked.length ? <p className="text-caption break-words text-ink-muted">Looked up: {m.looked.join("; ")}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </Card>
          <Card aria-labelledby="lead-touches">
            <CardHeader id="lead-touches" title="Each time they came" description="Newest first, with the tool and any campaign that brought them." />
            <ul className="divide-y divide-border">
              {lead.touches.map((t) => (
                <li key={t.id} className="flex flex-col gap-0.5 px-5 py-3 sm:px-6">
                  <span className="text-callout font-semibold text-ink">
                    {SOURCE_LABEL[t.source]} · {formatMoment(t.createdAt, tz)}
                  </span>
                  <span className="text-callout text-ink-muted">{t.summary}</span>
                  {t.campaign ? <span className="text-caption text-ink-muted">Campaign {[t.campaign, t.campaignSource, t.campaignMedium].filter(Boolean).join(" / ")}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="lead-details">
            <CardHeader id="lead-details" title="Their details" />
            <DetailList
              items={[
                [
                  "Email",
                  <a key="e" href={`mailto:${lead.email}`} className="break-all text-link hover:underline">
                    {lead.email}
                  </a>,
                ],
                [
                  "Phone",
                  lead.phone ? (
                    <a key="p" href={`tel:${lead.phone}`} className="text-link hover:underline">
                      {lead.phone}
                    </a>
                  ) : (
                    "Not given"
                  ),
                ],
                ["Market", lead.market.toUpperCase()],
                ["Came from", SOURCE_LABEL[lead.source]],
                ["Campaign", lead.campaign ? [lead.campaign, lead.campaignSource, lead.campaignMedium].filter(Boolean).join(" / ") : "None"],
                ["Received", formatMoment(lead.createdAt, tz)],
                ["Deleted on", formatDay(lead.purgeAfter, true)],
              ]}
            />
            <CardBody className="flex flex-col gap-2 border-t border-border">
              <p className="text-caption font-semibold text-ink-muted">What they need</p>
              <p className="text-body whitespace-pre-line text-ink">{lead.need}</p>
            </CardBody>
          </Card>
          <Card aria-labelledby="lead-status">
            <CardHeader
              id="lead-status"
              title="Follow up"
              description={handler && lead.handledAt ? `Last changed by ${handler.name ?? handler.email}, ${formatMoment(lead.handledAt, tz)}.` : "Mark it contacted once you have been in touch."}
            />
            <CardBody>
              <LeadStatusForm reference={lead.reference} status={lead.status} />
            </CardBody>
          </Card>
          <Card aria-labelledby="lead-emails">
            <CardHeader
              id="lead-emails"
              title="Follow-up emails"
              description={
                !lead.followUp
                  ? "None for this lead."
                  : lead.followUpStoppedAt
                    ? `${STOPPED_WORDS[lead.followUpStopped ?? ""] ?? "Stopped."} ${formatMoment(lead.followUpStoppedAt, tz)}.`
                    : `${lead.followUpStep} of ${SEQUENCES[lead.followUp as keyof typeof SEQUENCES]?.length ?? 0} sent.${lead.followUpAt ? ` Next ${formatMoment(lead.followUpAt, tz)}.` : ""} They stop when this person orders, unsubscribes or the lead is closed.`
              }
            />
            {lead.followUp && !lead.followUpStoppedAt ? (
              <CardBody>
                <StopFollowUpsForm reference={lead.reference} />
              </CardBody>
            ) : null}
          </Card>
          <Card aria-labelledby="lead-consent">
            <CardHeader id="lead-consent" title="Consent" description={`Ticked ${formatMoment(lead.consentAt, tz)}.`} />
            <CardBody>
              <p className="text-callout text-ink-body">{lead.consentText}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
