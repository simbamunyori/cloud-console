import { currentSession } from "@/server/auth/next";
import { enabledMarkets, siteMarket } from "@/server/site/site";
import { SiteFrame } from "./site-frame";

/** A public page in a market: the frame with the switcher, and "Open console" for a signed-in customer. */
export async function SitePage({ code, path, children }: { code: string; path: string; children: React.ReactNode }) {
  const [market, markets, session] = await Promise.all([siteMarket(code), enabledMarkets(), currentSession()]);
  return (
    <SiteFrame market={market} markets={markets} path={path} signedIn={session?.stage === "ACTIVE"}>
      {children}
    </SiteFrame>
  );
}
