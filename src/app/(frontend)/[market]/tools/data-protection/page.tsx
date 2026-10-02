import type { Metadata } from "next";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { siteMarket, siteMetadata } from "@/server/site/site";
import { QUESTIONS } from "@/server/tools/readiness";
import { ChecklistForm } from "./checklist-form";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const law = m.dataProtectionLaw ?? "data protection law";
  return siteMetadata(m.code, "/tools/data-protection", {
    title: `${law} readiness checklist | ${company.name}`,
    description: `Twelve questions about how you handle personal information. Get a score and your next steps under the ${law}, most important first.`,
  });
}

/** The Data Protection Act readiness checklist (final build, Milestone 8). */
export default async function DataProtectionPage({ params }: Props) {
  const m = await siteMarket((await params).market);
  const law = m.dataProtectionLaw ?? "data protection law";
  return (
    <SitePage code={m.code} path="/tools/data-protection">
      <div className="page-container flex flex-col gap-10 py-12 lg:gap-12 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-4">
          <p className="label-kicker text-link">Readiness checklist</p>
          <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">How ready are you for the {law}?</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">
            Twelve questions about how you handle personal information. You get a score and your next steps, most important first. It takes about three minutes.
          </p>
        </header>
        <ChecklistForm market={m.code} questions={QUESTIONS.map((q) => ({ key: q.key, text: q.text }))} />
        <p className="max-w-3xl text-caption text-ink-muted">This checklist is a guide to help you plan, not legal advice.</p>
      </div>
    </SitePage>
  );
}
