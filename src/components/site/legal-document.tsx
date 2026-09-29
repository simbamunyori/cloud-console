import { TriangleAlert } from "lucide-react";
import type { Legal } from "@/cms/payload-types";
import { PageIntro } from "./prose";
import { fill, SiteRichText, type TextMarket } from "./rich-text";

/** The banner kept on a legal page until a Publisher marks it approved by legal. */
export function DraftBanner({ text }: { text: string }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border border-warning bg-warning-soft p-4">
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <p className="text-callout font-semibold text-ink">{text}</p>
    </div>
  );
}

/** A market's legal page from the website editor. The draft banner stays until a Publisher marks it approved by legal. */
export function LegalView({ doc, market, children }: { doc: Legal; market: TextMarket & { name: string }; children?: React.ReactNode }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
      {doc.approvedByLegal ? null : <DraftBanner text={doc.draftNotice || "DRAFT FOR LEGAL REVIEW."} />}
      <PageIntro kicker={`Legal, ${market.name}`} title={fill(doc.title, market)} />
      <SiteRichText data={doc.body} market={market} style="legal" before={doc.updated ? <p className="text-callout text-ink-muted">{doc.updated}</p> : null} />
      {children}
    </article>
  );
}
