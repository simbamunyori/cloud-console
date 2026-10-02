import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LegalView } from "@/components/site/legal-document";
import { AssistantNotice, PageIntro, ProseSection } from "@/components/site/prose";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { LEGAL_PAGES, type LegalKind } from "@/config/site";
import { CATCH_ALL } from "@/lib/domain/markets";
import { legalPage } from "@/server/site/cms";
import { approvedDocument } from "@/server/site/legal";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string; kind: string }> };

const isKind = (k: string): k is LegalKind => k in LEGAL_PAGES;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, kind } = await params;
  if (!isKind(kind)) notFound();
  const m = await siteMarket(market);
  const fallback = { title: `${LEGAL_PAGES[kind]}, ${m.name} | ${company.name}`, description: `${company.legalName}: ${LEGAL_PAGES[kind].toLowerCase()} for customers in ${m.name}.` };
  const doc = await legalPage(m.code, kind);
  return doc ? cmsMetadata(m.code, `/legal/${kind}`, doc, fallback) : siteMetadata(m.code, `/legal/${kind}`, fallback);
}

/**
 * The legal pages for each market. A market's own text comes from the
 * website editor; its data protection page is the Security page.
 * Without text, a page shows the lawyer-approved document the market's
 * settings link. With neither it is not shown at all (Milestone 10),
 * except the privacy page, which keeps one product fact the Phase 1 go-ahead
 * requires: the assistant uses an AI service hosted outside the
 * customer's country.
 */
export default async function LegalPage({ params }: Props) {
  const { market, kind } = await params;
  if (!isKind(kind)) notFound();
  const m = await siteMarket(market);
  const written = await legalPage(m.code, kind);
  if (written && kind === "data-protection") redirect(`/${m.code}/security`);
  if (written) {
    return (
      <SitePage code={m.code} path={`/legal/${kind}`}>
        <LegalView doc={written} market={m} />
      </SitePage>
    );
  }
  const title = LEGAL_PAGES[kind];
  const document = approvedDocument(m.legalPages, kind);
  if (!document && kind !== "privacy") notFound();
  return (
    <SitePage code={m.code} path={`/legal/${kind}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:py-16">
        <PageIntro kicker={`Legal, ${m.name}`} title={title}>
          {company.legalName}
          {kind === "data-protection" && m.dataProtectionLaw ? `, under the ${m.dataProtectionLaw}` : ""}.
        </PageIntro>

        {document ? (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface-1 p-6">
            <p className="text-body text-ink-body">The current {title.toLowerCase()} for customers in {m.name}.</p>
            <Button asChild>
              <a href={document}>
                <FileText aria-hidden /> Read the {title.toLowerCase()}
              </a>
            </Button>
          </div>
        ) : null}

        {kind === "privacy" ? (
          <ProseSection id="assistant" title="Product notice: the assistant">
            <AssistantNotice countryName={m.code === CATCH_ALL ? "your country" : m.name} />
          </ProseSection>
        ) : null}
      </div>
    </SitePage>
  );
}
