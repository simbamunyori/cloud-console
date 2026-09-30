import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireWebsiteStaff } from "@/server/admin/context";
import { campaignReport } from "@/server/campaigns/campaigns";
import { prisma } from "@/server/db";
import { issueForStaff, monthName, newsletterCampaign } from "@/server/newsletter/issues";
import { canPublishWebsite } from "@/server/staff/access";
import { IssueForm, RefreshIssueForm, SendIssueForm } from "../forms";

export const metadata: Metadata = { title: "Newsletter issue" };

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireWebsiteStaff();
  const found = await issueForStaff(prisma, actor, (await params).id);
  if (!found) notFound();
  const { issue, items, subscribers } = found;
  const draft = issue.status === "DRAFT";
  const report = draft ? null : await campaignReport(prisma, newsletterCampaign(issue.month));
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/newsletter" className="hover:underline">Newsletter</Link>}
        title={`${monthName(issue.month)} in ${issue.market.toUpperCase()}`}
        actions={draft ? <Badge tone="warning">Draft</Badge> : <Badge tone="positive">Sent</Badge>}
      />
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <Card aria-labelledby="preview-title" className="min-w-0 xl:flex-1">
          <CardHeader id="preview-title" title="Preview" description="What each subscriber receives. Every link is tracked, and each copy has its own unsubscribe link." />
          <CardBody className="flex flex-col gap-5">
            <p className="text-callout text-ink-muted">
              Subject: <span className="font-semibold text-ink">{issue.subject}</span>
            </p>
            <h2 className="text-title-2 text-ink">{monthName(issue.month)}</h2>
            {issue.intro ? <p className="text-body text-ink">{issue.intro}</p> : null}
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {items.map((i) => (
                <li key={i.slug} className="flex flex-col gap-1 py-4">
                  <a href={`/${issue.market}/insights/${i.slug}`} className="text-headline text-link hover:underline">
                    {i.title}
                  </a>
                  <p className="text-callout text-ink-muted">{i.summary}</p>
                </li>
              ))}
            </ul>
            {items.length === 0 ? <Alert tone="warning">There are no articles in this issue. Publish insights for the month, then read them again.</Alert> : null}
          </CardBody>
        </Card>
        <div className="flex shrink-0 flex-col gap-6 xl:w-104">
          {draft ? (
            <>
              <Card aria-labelledby="edit-title">
                <CardHeader id="edit-title" title="Words" />
                <CardBody className="flex flex-col gap-6">
                  <IssueForm id={issue.id} subject={issue.subject} intro={issue.intro} />
                  <RefreshIssueForm id={issue.id} />
                </CardBody>
              </Card>
              <Card aria-labelledby="send-title">
                <CardHeader id="send-title" title="Send" />
                <CardBody className="flex flex-col gap-4">
                  {canPublishWebsite(actor.websiteRole) ? (
                    <>
                      <p className="text-callout text-ink-muted">It goes to the {subscribers} confirmed subscribers in {issue.market.toUpperCase()}, once.</p>
                      <SendIssueForm id={issue.id} subscribers={subscribers} />
                    </>
                  ) : (
                    <p className="text-callout text-ink-muted">A website Publisher sends the newsletter.</p>
                  )}
                </CardBody>
              </Card>
            </>
          ) : (
            <Card aria-labelledby="sent-title">
              <CardHeader id="sent-title" title="Sent" />
              <CardBody className="flex flex-col gap-2 text-callout text-ink">
                <p>
                  Sent {issue.sentAt ? formatDay(issue.sentAt, true) : ""} to {issue.recipients} {issue.recipients === 1 ? "subscriber" : "subscribers"}.
                </p>
                {report ? (
                  <p className="text-ink-muted">
                    Since then: {report.visits} visits, {report.leads} leads, {report.quotes} quote requests and {report.signUps} sign-ups from its links.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
