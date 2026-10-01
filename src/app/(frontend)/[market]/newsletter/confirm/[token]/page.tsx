import type { Metadata } from "next";
import { SitePage } from "@/components/site/site-page";
import { siteMarket } from "@/server/site/site";
import { TokenButton } from "../../forms";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ market: string; token: string }> }) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  return (
    <SitePage code={m.code} path="">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-title-1 text-ink sm:text-display">Confirm your subscription</h1>
        <p className="text-body text-ink-muted">One click and we&apos;ll send our insights email once a month: practical advice on security, backup and running your business online.</p>
        <TokenButton token={decodeURIComponent(token)} kind="confirm" />
      </div>
    </SitePage>
  );
}
