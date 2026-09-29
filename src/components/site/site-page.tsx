import { currentSession } from "@/server/auth/next";
import { showingDrafts, siteFrameContent } from "@/server/site/cms";
import { enabledMarkets, siteMarket } from "@/server/site/site";
import { currentTheme } from "@/server/theme";
import { env } from "@/server/env";
import { LivePreview } from "./live-preview";
import { SiteFrame } from "./site-frame";

/** A public page in a market: the frame with the switcher, and "Open console" for a signed-in customer. */
export async function SitePage({ code, path, children }: { code: string; path: string; children: React.ReactNode }) {
  const [market, markets, session, theme, drafts] = await Promise.all([siteMarket(code), enabledMarkets(), currentSession(), currentTheme(), showingDrafts()]);
  const content = await siteFrameContent(market);
  return (
    <SiteFrame market={market} markets={markets} path={path} signedIn={session?.stage === "ACTIVE"} theme={theme} statusUrl={env().STATUS_PAGE_URL} content={content}>
      {drafts ? <LivePreview /> : null}
      {children}
    </SiteFrame>
  );
}
