import type { Metadata } from "next";
import { SitePage } from "@/components/site/site-page";
import { siteMarket } from "@/server/site/site";
import { StopForm } from "./stop-form";

export const metadata: Metadata = { title: "Stop these emails", robots: { index: false } };

/** The link in every follow-up email (Milestone 8). A button, so link scanners can't press it. */
export default async function Page({ params }: { params: Promise<{ market: string; token: string }> }) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  return (
    <SitePage code={m.code} path="">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-title-1 text-ink sm:text-display">Stop these emails</h1>
        <p className="text-body text-ink-muted">We&apos;ll stop the follow-up emails from our free tools and website. If you&apos;re a customer, account emails such as invoices still come.</p>
        <StopForm token={decodeURIComponent(token)} />
      </div>
    </SitePage>
  );
}
