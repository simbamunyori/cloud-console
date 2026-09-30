import type { Metadata } from "next";
import { SitePage } from "@/components/site/site-page";
import { siteMarket } from "@/server/site/site";
import { TokenButton } from "../../forms";

export const metadata: Metadata = { title: "Unsubscribe from the insights email", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ market: string; token: string }> }) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  return (
    <SitePage code={m.code} path="">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-title-1 text-ink sm:text-display">Unsubscribe from the insights email</h1>
        <p className="text-body text-ink-muted">We&apos;ll stop sending you the monthly insights email. You can sign up again at any time.</p>
        <TokenButton token={decodeURIComponent(token)} kind="unsubscribe" />
      </div>
    </SitePage>
  );
}
