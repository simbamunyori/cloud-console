import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, Stat } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireWebsiteStaff } from "@/server/admin/context";
import { campaignReport } from "@/server/campaigns/campaigns";
import { prisma } from "@/server/db";
import { FAQ_SLOTS, faqOf, kitForStaff, kitLinks, kitMarket } from "@/server/launch/kits";
import { cms } from "@/server/site/cms";
import { canPublishWebsite } from "@/server/staff/access";
import { retryDraftsAction } from "../actions";
import { ApproveLinkedinForm, ApprovePageForm, CopyButton, KitEditForm } from "../forms";
import { KitStatusBadge } from "../status";
import { siteUrl } from "@/server/site/urls";

export const metadata: Metadata = { title: "Launch kit" };

/** The insight draft's state in the website editor, or null when it has gone. */
async function insightState(id: string | null) {
  if (!id) return null;
  try {
    const doc = await (await cms()).findByID({ collection: "insights", id, draft: true, depth: 0, overrideAccess: true });
    return { title: doc.title, published: doc._status === "published" };
  } catch {
    return null;
  }
}

export default async function LaunchKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireWebsiteStaff();
  const kit = await kitForStaff(prisma, actor, (await params).id);
  if (!kit) notFound();
  const p = kit.product;
  const publisher = canPublishWebsite(actor.websiteRole);
  const defaultMarket = (await prisma.market.findFirst({ where: { isDefault: true }, select: { code: true } }))?.code ?? "bw";
  const market = kitMarket(p.markets, defaultMarket);
  const links = kitLinks(siteUrl(), market, p.slug, kit.campaign);
  const postLink = links.find((l) => l.key === "linkedin-post")!.url;
  const [report, insight] = await Promise.all([campaignReport(prisma, kit.campaign), insightState(kit.insightId)]);
  const pageLive = Boolean(kit.pageApprovedAt) && p.status === "LIVE";
  const drafting = !kit.draftedAt;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/launch-kits" className="hover:underline">Launch kits</Link>}
        title={p.name}
        description={p.summary}
        actions={
          <>
            <KitStatusBadge kit={kit} />
            <Button asChild variant="secondary" size="sm">
              <Link href={`/admin/catalogue/products/${p.slug}`}>Catalogue entry</Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {p.status !== "LIVE" ? <Alert tone="warning">This product is no longer live, so its page and share image are off the website whatever is approved here.</Alert> : null}
        {drafting ? <Alert tone="info">The first drafts are being written. Refresh in a few minutes; anything you save now is kept.</Alert> : null}
        {kit.draftError ? (
          <Alert tone={kit.insightId ? "info" : "negative"}>
            <div className="flex flex-col gap-3">
              <p>{kit.draftError}</p>
              <form action={retryDraftsAction}>
                <input type="hidden" name="id" value={kit.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Write the drafts again
                </Button>
              </form>
            </div>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <Card aria-labelledby="words-title" className="min-w-0 xl:flex-1">
            <CardHeader id="words-title" title="Words" description="What the product page and the LinkedIn post say. The rest of the page comes from the catalogue and the price book." />
            <CardBody>
              <KitEditForm id={kit.id} audience={kit.audience} faq={faqOf(kit.faq)} linkedinText={kit.linkedinText} slots={FAQ_SLOTS} />
            </CardBody>
          </Card>

          <div className="flex shrink-0 flex-col gap-6 xl:w-104">
            <Card aria-labelledby="page-title">
              <CardHeader id="page-title" title="Product page" action={kit.pageApprovedAt ? <Badge tone="positive">Approved</Badge> : <Badge tone="warning">Not approved</Badge>} />
              <CardBody className="flex flex-col gap-4">
                {kit.pageApprovedAt ? (
                  <p className="text-callout text-ink-muted">Approved {formatDay(kit.pageApprovedAt, true)}.</p>
                ) : (
                  <p className="text-callout text-ink-muted">The page shows once a Publisher approves it. A change by an Editor sends it back for approval.</p>
                )}
                {pageLive ? (
                  <Link href={`/${market}/products/${p.slug}`} className="w-fit text-callout font-semibold text-link hover:underline">
                    Open the page
                  </Link>
                ) : null}
                {publisher ? <ApprovePageForm id={kit.id} approved={Boolean(kit.pageApprovedAt)} /> : null}
              </CardBody>
            </Card>

            <Card aria-labelledby="insight-title">
              <CardHeader id="insight-title" title="Insight article" action={insight ? <Badge tone={insight.published ? "positive" : "warning"}>{insight.published ? "Published" : "Draft"}</Badge> : null} />
              <CardBody className="flex flex-col gap-4">
                {insight ? (
                  <>
                    <p className="text-body text-ink">{insight.title}</p>
                    <p className="text-callout text-ink-muted">Edit it in the website editor. A Publisher publishes it there, and it then shows on the Insights page, the home page and in Thapelo&apos;s answers.</p>
                    <a href={`/admin/content/collections/insights/${kit.insightId}`} className="w-fit text-callout font-semibold text-link hover:underline">
                      Open in the website editor
                    </a>
                  </>
                ) : (
                  <p className="text-callout text-ink-muted">{drafting ? "The draft is being written." : "There is no draft. Write one in the website editor, or write the drafts again."}</p>
                )}
              </CardBody>
            </Card>

            <Card aria-labelledby="linkedin-title">
              <CardHeader id="linkedin-title" title="LinkedIn post" action={kit.linkedinApprovedAt ? <Badge tone="positive">Approved</Badge> : <Badge tone="warning">Not approved</Badge>} />
              <CardBody className="flex flex-col gap-4">
                {kit.linkedinApprovedAt && pageLive ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/share/${p.slug}`} alt={`The share image for ${p.name}`} width={1200} height={627} className="h-auto w-full rounded-md border border-border" />
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={`${kit.linkedinText}\n\n${postLink}`} label="Copy the post" />
                      <Button asChild variant="secondary" size="sm">
                        <a href={`/api/share/${p.slug}`} download={`${p.slug}-linkedin.png`}>
                          Download the image
                        </a>
                      </Button>
                    </div>
                    <p className="text-callout text-ink-muted">Post it from the company page with the image. The link in the post is tracked.</p>
                  </>
                ) : kit.linkedinApprovedAt ? (
                  <p className="text-callout text-ink-muted">Approved. The post and image are ready to copy once the product page is on the website, since the post links to it.</p>
                ) : (
                  <p className="text-callout text-ink-muted">A Publisher approves the post before anyone copies it.</p>
                )}
                {publisher && !kit.linkedinApprovedAt && kit.linkedinText ? <ApproveLinkedinForm id={kit.id} /> : null}
              </CardBody>
            </Card>
          </div>
        </div>

        <Card aria-labelledby="links-title">
          <CardHeader id="links-title" title="Tracked links" description={`Each link opens the product page in ${market.toUpperCase()} and carries the campaign ${kit.campaign}, so visits, leads, quotes and sign-ups are counted below.`} />
          {pageLive ? (
            <ul className="divide-y divide-border">
              {links.map((l) => (
                <li key={l.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                  <span className="w-40 shrink-0 text-callout font-semibold text-ink">{l.label}</span>
                  <code className="min-w-0 flex-1 truncate text-caption text-ink-muted">{l.url}</code>
                  <CopyButton text={l.url} label="Copy link" />
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-callout text-ink-muted">The links appear once the product page is on the website.</p>
            </CardBody>
          )}
        </Card>

        <Card aria-labelledby="results-title">
          <CardHeader id="results-title" title="Results" description="Counted from the tracked links. A lead, quote request or sign-up counts when it comes within 30 days of the visit. Orders count from organisations that signed up through a link." />
          <CardBody className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Visits">{report.visits}</Stat>
              <Stat label="Leads">{report.leads}</Stat>
              <Stat label="Quote requests">{report.quotes}</Stat>
              <Stat label="Sign-ups">{report.signUps}</Stat>
              <Stat label="Orders">{report.orders}</Stat>
            </div>
            {report.bySource.length ? <DetailList items={report.bySource.map((s) => [s.label, s.visits])} /> : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
