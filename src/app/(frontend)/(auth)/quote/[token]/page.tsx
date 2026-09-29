import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { QuoteLines, QuoteStateBadge, validityText } from "@/components/quotes/quote-view";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { currentSession } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { can } from "@/server/org/access";
import { quoteByToken, quoteState, quoteTaxNote, todayForMarket } from "@/server/quotes/quotes";
import { DeclineFromLinkForm, OpenInAccountForm } from "./forms";

export const metadata: Metadata = {
  title: "Your quote",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The member's current organisation, if they are signed in; no redirect when they aren't. */
async function signedInMember() {
  const session = await currentSession();
  if (session?.stage !== "ACTIVE" || !session.activeOrganisationId) return null;
  const membership = await prisma.membership.findUnique({
    where: { organisationId_userId: { organisationId: session.activeOrganisationId, userId: session.userId } },
    include: { organisation: { select: { id: true, name: true, currency: true, deletedAt: true } } },
  });
  if (!membership?.active || membership.organisation.deletedAt) return null;
  return { role: membership.role, organisation: membership.organisation, email: session.user.email };
}

/**
 * Where a quote's emailed link opens. Anyone with the link can read it and
 * decline it; accepting happens in an account.
 */
export default async function QuoteLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  const found = await quoteByToken(prisma, token);

  if (!found) {
    return (
      <AuthShell>
        <div className="flex flex-col gap-6">
          <AuthHeading title="This link doesn't work" />
          <Alert tone="info">
            It may be an older email about a quote we sent again, or the quote was accepted, declined or changed. Use the newest email, or reply to it and we&apos;ll help.
          </Alert>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const { quote, market } = found;
  const state = quoteState(quote, todayForMarket(market));
  const member = await signedInMember();
  const next = `/quote/${encodeURIComponent(token)}`;

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <AuthHeading eyebrow={quote.reference} title={`Your quote, ${quote.name.split(" ")[0]}`}>
          {quote.product ? `For ${quote.product.name}. ` : ""}
          {validityText(quote.validUntil, state)}
        </AuthHeading>
        <div>
          <QuoteStateBadge state={state} />
        </div>
        {quote.message ? <p className="whitespace-pre-line text-ink-body">{quote.message}</p> : null}
        <QuoteLines lines={quote.lines} currency={market.currency} locale={market.locale} taxNote={quoteTaxNote(market)} />
        {quote.product && quote.product.minTermMonths > 1 ? (
          <Alert tone="info">A minimum term of {quote.product.minTermMonths} months applies. {quote.product.commitmentNote}</Alert>
        ) : null}

        {state === "expired" ? (
          <Alert tone="info">This quote has expired. Reply to the email and we&apos;ll send a new one.</Alert>
        ) : state !== "sent" ? null : member ? (
          can({ role: member.role }, "order") ? (
            <OpenInAccountForm token={token} organisation={member.organisation.name} />
          ) : (
            <Alert tone="info">You&apos;re signed in to {member.organisation.name} without permission to order. Ask an owner or admin to accept it, or forward them the email.</Alert>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-callout text-ink-muted">To accept, sign in to your account. If you don&apos;t have one yet, open one and then use this link again.</p>
            <Button asChild size="lg" className="w-full">
              <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to accept</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full">
              <Link href="/sign-up">Open an account</Link>
            </Button>
          </div>
        )}
        {state === "sent" ? <DeclineFromLinkForm token={token} /> : null}
      </div>
    </AuthShell>
  );
}
