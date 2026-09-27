import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantNotice, PageIntro, ProseSection } from "@/components/site/prose";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { LEGAL_PAGES, type LegalKind } from "@/config/site";
import { CATCH_ALL } from "@/lib/domain/markets";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string; kind: string }> };

/** Market.legalPages keys, by page. */
const SETTING: Record<LegalKind, string> = { privacy: "privacy", terms: "terms", "data-protection": "dataProtection" };

const isKind = (k: string): k is LegalKind => k in LEGAL_PAGES;

/** A lawyer-approved document's address from the market's settings, if staff have added one. */
function approvedDocument(legalPages: unknown, kind: LegalKind): string | null {
  const v = legalPages && typeof legalPages === "object" ? (legalPages as Record<string, unknown>)[SETTING[kind]] : null;
  return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, kind } = await params;
  if (!isKind(kind)) notFound();
  const m = await siteMarket(market);
  return siteMetadata(m.code, `/legal/${kind}`, { title: `${LEGAL_PAGES[kind]}, ${m.name} | ${company.name}`, description: `${company.legalName}: ${LEGAL_PAGES[kind].toLowerCase()} for customers in ${m.name}.` });
}

/**
 * The legal pages for each market. We don't write legal text: until the
 * market's settings link a lawyer-approved document, each page says so
 * plainly. The privacy page keeps one product fact the Phase 1 go-ahead
 * requires: the assistant uses an AI service hosted outside the
 * customer's country.
 */
export default async function LegalPage({ params }: Props) {
  const { market, kind } = await params;
  if (!isKind(kind)) notFound();
  const m = await siteMarket(market);
  const title = LEGAL_PAGES[kind];
  const document = approvedDocument(m.legalPages, kind);
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
        ) : (
          <div role="note" className="flex flex-col gap-2 rounded-lg border border-dashed border-border-strong bg-surface-2 p-6">
            <p className="label-kicker text-warning">Placeholder</p>
            <p className="text-body text-ink">This page is waiting for text from our lawyers.</p>
            <p className="text-callout text-ink-muted">
              Until it is published, write to{" "}
              <a href={`mailto:${m.supportEmail}`} className="text-link underline">
                {m.supportEmail}
              </a>{" "}
              with any question about it.
            </p>
          </div>
        )}

        {kind === "privacy" ? (
          <ProseSection id="assistant" title="Product notice: the assistant">
            <AssistantNotice countryName={m.code === CATCH_ALL ? "your country" : m.name} />
          </ProseSection>
        ) : null}
      </div>
    </SitePage>
  );
}
