import { currentSession } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { showingDrafts, siteFrameContent } from "@/server/site/cms";
import { approvedPartners, emailPartner, liveAnnouncement } from "@/server/site/proof";
import { enabledMarkets, siteMarket } from "@/server/site/site";
import { serviceStatus } from "@/server/status/status";
import { currentTheme } from "@/server/theme";
import { linkHref } from "./links";
import { LivePreview } from "./live-preview";
import { SiteFrame } from "./site-frame";

/** A public page in a market: the frame with its menus, live status and switcher, and "Open console" for a signed-in customer. */
export async function SitePage({ code, path, children }: { code: string; path: string; children: React.ReactNode }) {
  const [market, markets, session, theme, drafts, status] = await Promise.all([siteMarket(code), enabledMarkets(), currentSession(), currentTheme(), showingDrafts(), serviceStatus(prisma)]);
  const e = env();
  const [content, partners, partner, announcement] = await Promise.all([siteFrameContent(market), approvedPartners(market.code), emailPartner(market.code), liveAnnouncement(market.code)]);
  const announcementHref = announcement ? linkHref(announcement.link, { ...market, thebeUrl: e.THEBE_URL }) : null;
  return (
    <SiteFrame
      market={market}
      markets={markets}
      path={path}
      signedIn={session?.stage === "ACTIVE"}
      theme={theme}
      status={{ state: status.state, label: status.label, href: e.STATUS_PAGE_URL ?? `/${market.code}/status` }}
      content={content}
      features={{
        code: market.code,
        money: { locale: market.locale, currency: market.currency },
        contact: content.contact,
        thebe: { tryUrl: e.THEBE_TRY_URL, demoUrl: e.THEBE_DEMO_URL },
        partner: partner ? { badge: partner.badge, link: partner.link ?? null } : null,
      }}
      proof={{
        badges: partners.map((p) => ({ id: p.id, badge: p.badge, link: p.link ?? null })),
        announcement: announcement?.text ? { text: announcement.text, link: announcementHref && announcement.link?.label ? { label: announcement.link.label, href: announcementHref } : null } : null,
      }}
    >
      {drafts ? <LivePreview /> : null}
      {children}
    </SiteFrame>
  );
}
