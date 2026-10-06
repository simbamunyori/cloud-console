import type { Metadata } from "next";
import { RatingForm } from "@/components/app/rating-form";
import { SitePage } from "@/components/site/site-page";
import { siteMarket } from "@/server/site/site";
import { rateByLinkAction } from "./actions";

export const metadata: Metadata = { title: "How did we do?", robots: { index: false } };

/** The link in the "How did we do?" email (U7). The score from the email is chosen; a button sends it, so link scanners can't. */
export default async function Page({ params, searchParams }: { params: Promise<{ market: string; token: string }>; searchParams: Promise<{ score?: string }> }) {
  const [{ market, token }, { score }] = await Promise.all([params, searchParams]);
  const m = await siteMarket(market);
  return (
    <SitePage code={m.code} path="">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-title-1 text-ink sm:text-display">How did we do?</h1>
        <p className="text-body text-ink-muted">One question about the help you had from our support team.</p>
        <RatingForm action={rateByLinkAction} hidden={{ token: decodeURIComponent(token) }} score={Number(score) || undefined} />
      </div>
    </SitePage>
  );
}
