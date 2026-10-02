import { ArrowRight, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/components/site/site-page";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { currentSession } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { partnerLinks } from "@/server/site/partner-links";
import { productHref, siteMarket, sitePrices } from "@/server/site/site";
import { answersOf, band, nextSteps, QUESTIONS } from "@/server/tools/readiness";
import { readinessByToken } from "@/server/tools/readiness-store";
import { TOOL_CONSENT } from "@/server/tools/site-tools";
import { emailReadinessAction } from "../../actions";
import { ToolLeadForm } from "../../lead-form";

type Props = { params: Promise<{ market: string; token: string }> };

export const metadata: Metadata = { title: { absolute: `Your data protection readiness | ${company.name}` }, robots: { index: false, follow: false } };

const ANSWER: Record<string, { word: string; tone: BadgeTone }> = { no: { word: "No", tone: "negative" }, partly: { word: "Partly", tone: "warning" } };

/** A checklist result, at the link only its owner has. */
export default async function ReadinessResultPage({ params }: Props) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  const row = await readinessByToken(prisma, token);
  if (!row || row.market !== m.code) notFound();
  const law = m.dataProtectionLaw ?? "data protection law";
  const answers = answersOf(row.answers);
  const steps = nextSteps(answers);
  const b = band(row.score);
  const [session, { bookingHref }, prices] = await Promise.all([currentSession(), partnerLinks(m.code), sitePrices(m.code)]);
  const summary = `/app/readiness/${encodeURIComponent(row.token)}`;
  const products = async (slugs: string[]) =>
    Promise.all(
      prices
        .filter((p) => slugs.includes(p.slug))
        .slice(0, 2)
        .map(async (p) => ({ name: p.name, href: await productHref(m.code, p) })),
    );
  const withProducts = await Promise.all(steps.map(async (s) => ({ ...s, help: await products(s.products) })));

  return (
    <SitePage code={m.code} path="/tools/data-protection">
      <div className="page-container flex flex-col gap-10 py-12 lg:gap-14 lg:py-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
          <header className="flex min-w-0 flex-1 flex-col gap-4">
            <p className="label-kicker text-link">Your readiness for the {law}</p>
            <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">
              {row.score} out of 100: {b.label.toLowerCase()}.
            </h1>
            <p className="max-w-3xl text-body text-ink-muted xl:text-headline xl:font-normal">{b.text}</p>
            <p>
              <Link href={`/${m.code}/tools/data-protection`} className="text-callout font-semibold text-link hover:underline">
                Answer again
              </Link>
            </p>
          </header>
          <aside aria-labelledby="summary-title" className="flex h-fit shrink-0 flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6 lg:w-96 xl:w-112 xl:p-8">
            <h2 id="summary-title" className="text-headline text-ink">
              Your summary as a PDF
            </h2>
            <p className="text-callout text-ink-muted">Your score, every answer and the next steps in order, to share with your team or board.</p>
            {session?.stage === "ACTIVE" && session.user.kind === "CUSTOMER" ? (
              <Button asChild size="lg">
                <Link href={summary}>
                  <Download aria-hidden className="size-4" /> Download the summary
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href={`/sign-up?next=${encodeURIComponent(summary)}`}>Open a free account to download</Link>
                </Button>
                <p className="text-center text-callout text-ink-muted">
                  Have an account?{" "}
                  <Link href={`/sign-in?next=${encodeURIComponent(summary)}`} className="font-semibold text-link hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </aside>
        </div>

        <section aria-labelledby="steps-title" className="flex flex-col gap-5">
          <h2 id="steps-title" className="text-title-2 text-ink">
            {steps.length ? "Your next steps" : "Nothing to do for now"}
          </h2>
          {steps.length ? (
            <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {withProducts.map((s, i) => (
                <li key={s.key} className="flex flex-col gap-2 p-5 sm:flex-row sm:gap-6 xl:px-8">
                  <span className="w-8 shrink-0 text-headline text-ink-muted tabular-nums">{i + 1}.</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-body text-ink">{s.step}</p>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-callout text-ink-muted">
                      <span className="flex items-center gap-2">
                        You answered <Badge tone={ANSWER[s.answer]?.tone ?? "neutral"}>{ANSWER[s.answer]?.word ?? s.answer}</Badge>
                      </span>
                      {s.help.map((h) => (
                        <Link key={h.href} href={h.href} className="inline-flex items-center gap-1 text-link hover:underline">
                          {h.name} <ArrowRight aria-hidden className="size-4" />
                        </Link>
                      ))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="max-w-3xl text-body text-ink">You answered yes to all {QUESTIONS.length} questions. Go through them again once a year, and whenever you take on a new system or supplier.</p>
          )}
          {bookingHref ? (
            <p>
              <Button asChild size="lg" variant="secondary">
                <Link href={`${bookingHref}?topic=data-protection`}>Talk it through with an engineer</Link>
              </Button>
            </p>
          ) : null}
        </section>

        <div className="max-w-3xl">
          <ToolLeadForm
            action={emailReadinessAction}
            hidden={[
              ["market", m.code],
              ["token", row.token],
            ]}
            heading="Email me my results"
            text="Your score and next steps, with the link to your summary."
            button="Email me my results"
            consent={TOOL_CONSENT}
            privacyHref={`/${m.code}/legal/privacy`}
          />
        </div>
        <p className="max-w-3xl text-caption text-ink-muted">This checklist is a guide to help you plan, not legal advice.</p>
      </div>
    </SitePage>
  );
}
