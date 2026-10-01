import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { answersOf, band, nextSteps } from "@/server/tools/readiness";
import { claimReadiness } from "@/server/tools/readiness-store";

export const metadata: Metadata = { title: "Data protection readiness" };

/** The checklist a visitor filled in before they had an account, now theirs to download. */
export default async function ReadinessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { organisation, market } = await requireMember();
  const row = await claimReadiness(prisma, token, organisation.id);
  if (!row) notFound();
  const law = market.dataProtectionLaw ?? "data protection law";
  const steps = nextSteps(answersOf(row.answers));
  const b = band(row.score);
  return (
    <>
      <PageHeader
        eyebrow="Readiness checklist"
        title={`${row.score} out of 100: ${b.label.toLowerCase()}`}
        description={`Measured against the ${law}. ${b.text}`}
        actions={
          <Button asChild>
            <a href={`/app/readiness/${encodeURIComponent(row.token)}/summary`} download>
              <Download aria-hidden className="size-4" /> Download the summary
            </a>
          </Button>
        }
      />
      <Card aria-labelledby="steps-title">
        <CardHeader id="steps-title" title="Next steps" description="Most important first. The summary has every answer too." />
        <CardBody>
          {steps.length ? (
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-body text-ink">
              {steps.map((s) => (
                <li key={s.key}>{s.step}</li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-ink">You answered yes to every question. Go through them again once a year.</p>
          )}
        </CardBody>
      </Card>
      <p className="mt-6 text-callout text-ink-muted">
        Want help with the technical steps?{" "}
        <Link href="/app/support" className="font-semibold text-link hover:underline">
          Ask our team
        </Link>
        .
      </p>
    </>
  );
}
