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
import { leadForStaff } from "@/server/sales/leads";
import { LeadStatusForm } from "../forms";
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
        <Card aria-labelledby="lead-chat">
          <CardHeader
            id="lead-chat"
            title="The conversation"
            description={conversation.length ? "What the visitor asked Thapelo, and what Thapelo looked up to answer." : "They used the form without chatting first."}
          />
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
                ["Came from", lead.source === "PERSON" ? "Asked for a person" : "Asked us to get back to them"],
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
