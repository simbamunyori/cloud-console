import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { prisma } from "@/server/db";
import { KIND_LABEL, percentOf, REFERRAL_CONSENT, REFERRAL_DAYS, referralSettings, referralsOn } from "@/server/referrals/referrals";
import { siteMarket, siteMetadata } from "@/server/site/site";
import { ApplyForm } from "./forms";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  return siteMetadata(m.code, "/referral-partners", {
    title: `Referral partners | ${company.name}`,
    description: "Accountants, consultants and IT resellers: refer your clients to us and earn a share of what they pay, every month.",
  });
}

/** The referral partner programme (U9). Not found until an Admin turns it on. */
export default async function ReferralPartnersPage({ params }: Props) {
  const m = await siteMarket((await params).market);
  if (!(await referralsOn(prisma))) notFound();
  const { commissionBps } = await referralSettings(prisma);
  const steps = [
    ["Apply", "Tell us about your firm. We usually reply within two working days."],
    ["Share your link", `Once approved, you get your own link. Anyone who signs up through it within ${REFERRAL_DAYS} days counts as your customer.`],
    ["Earn every month", `You earn ${percentOf(commissionBps)} of what your customers pay us, for as long as they stay. A statement comes early each month and we pay what's due to your bank account.`],
  ];
  return (
    <SitePage code={m.code} path="/referral-partners">
      <div className="page-container flex flex-col gap-12 py-12 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="label-kicker text-link">Referral partners</p>
          <h1 className="text-title-1 text-ink sm:text-display">Your clients need IT they can rely on. Send them to us.</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">
            For accountants, consultants and IT resellers. We look after your clients&apos; email, security, backup and cloud, and you earn a share of what they pay us.
          </p>
        </header>
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex flex-col gap-2 border-t border-ink pt-5">
              <span className="text-callout font-semibold text-link tabular-nums">{i + 1}</span>
              <h2 className="text-headline text-ink">{title}</h2>
              <p className="text-callout text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
        <section aria-labelledby="apply-title" className="flex max-w-3xl flex-col gap-4">
          <h2 id="apply-title" className="text-title-2 text-ink">
            Apply
          </h2>
          <ApplyForm market={m.code} kinds={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} consent={REFERRAL_CONSENT} privacyHref={`/${m.code}/legal/privacy`} />
        </section>
      </div>
    </SitePage>
  );
}
