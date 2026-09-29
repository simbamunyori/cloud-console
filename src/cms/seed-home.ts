import type { Page } from "./payload-types";
import { AUDIENCES, BUILDERS, CLOSING, CONSOLE, HERO, marketCopy, PLATE, SERVICES } from "@/config/site";
import type { IconName } from "./icons";

/**
 * The home page as the website editor's first content: the same words,
 * pictures and prices as the built-in page (src/components/site/home.tsx),
 * as blocks, one layout per market. Added by seedWebsite below.
 */

type Layout = NonNullable<Page["layout"]>;

const PLATE_ICONS: IconName[] = ["users", "credit-card", "life-buoy", "shield-check"];
const SERVICE_ICONS: Record<string, IconName> = { productivity: "mail", servers: "server", security: "lock", protection: "hard-drive", web: "layout-grid", apps: "boxes" };
const CONSOLE_ICONS: IconName[] = ["sparkles", "users", "credit-card", "life-buoy"];
const AUDIENCE_ICONS: IconName[] = ["graduation-cap", "building", "trending-up", "handshake"];

export function homeLayout(market: string): Layout {
  const copy = marketCopy(market);
  return [
    {
      blockType: "hero",
      kicker: HERO.kicker,
      heading: HERO.headline,
      sub: HERO.sub,
      primary: { label: "View plans", to: "market", path: "/pricing" },
      secondary: { label: "Talk to us", to: "email", subject: "Talk to us" },
      supporting: HERO.supporting.map((text) => ({ text })),
      picture: { source: "console-home", caption: "The Cloud Console, with demo data." },
      domainSearch: true,
    },
    {
      blockType: "featureCards",
      kicker: "What we take off your plate",
      heading: PLATE.heading,
      tone: "plain",
      style: "raised",
      items: PLATE.cards.map(([title, body], i) => ({ icon: PLATE_ICONS[i], title, body })),
    },
    {
      blockType: "servicesGrid",
      kicker: "Services",
      heading: "Everything you run, managed by one team.",
      intro: "Prices are per month, in your currency, on one invoice.",
      tone: "light",
      anchor: "services",
      showTaxNote: true,
      cards: SERVICES.map((card) => ({
        icon: SERVICE_ICONS[card.key] ?? "boxes",
        title: card.title,
        body: card.body,
        note: card.key === "protection" ? (copy.localHosting ?? null) : null,
        dataCentre: card.key === "servers",
        products: { categories: card.products.categories ?? [], products: card.products.slugs ?? [] },
      })),
      more: { label: "See every price", to: "market", path: "/pricing" },
    },
    {
      blockType: "imageText",
      kicker: "The Cloud Console",
      heading: CONSOLE.heading,
      tone: "plain",
      points: CONSOLE.points.map(([title, body], i) => ({ icon: CONSOLE_ICONS[i], title, body })),
      picture: { source: "console-invoice", caption: "A monthly invoice in the Cloud Console, with demo data." },
      pictureSide: "right",
    },
    {
      blockType: "imageText",
      heading: BUILDERS.heading,
      intro: BUILDERS.body,
      tone: "dark",
      picture: { source: "thebe-approvals" },
      pictureSide: "right",
      card: { kicker: "Our software", title: BUILDERS.thebe.name, body: BUILDERS.thebe.body, link: { label: "See Thebe's price", to: "market", path: "/pricing#cat-our-software" } },
    },
    {
      blockType: "featureCards",
      heading: AUDIENCES.heading,
      tone: "plain",
      style: "flat",
      items: AUDIENCES.items.map(([title, body], i) => ({ icon: AUDIENCE_ICONS[i], title, body })),
    },
    { blockType: "testimonials", tone: "plain", items: copy.testimonials },
    {
      blockType: "callToAction",
      heading: CLOSING.heading,
      tone: "light",
      primary: { label: "Get started", to: "site", path: "/sign-up" },
      secondary: { label: "Book a call", to: "email", subject: "Book a call" },
    },
  ] as Layout;
}

type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;

/**
 * Gives the editor its first page: the home page in every market, published.
 * Only when the editor has no pages at all, so an editor's work is never
 * overwritten. Returns what it did, in words, or null when it did nothing.
 */
export async function seedWebsite(payload: Payload): Promise<string | null> {
  const { totalDocs } = await payload.count({ collection: "pages", overrideAccess: true });
  if (totalDocs) return null;
  const { MARKET_LOCALES } = await import("./locales");
  const [first, ...rest] = MARKET_LOCALES;
  const page = await payload.create({ collection: "pages", locale: first.code, data: { title: "Home", slug: "home", layout: homeLayout(first.code), _status: "published" }, overrideAccess: true });
  for (const l of rest) {
    await payload.update({ collection: "pages", id: page.id, locale: l.code, data: { layout: homeLayout(l.code), _status: "published" }, overrideAccess: true });
  }
  return `Added the home page to the website editor, published in ${MARKET_LOCALES.map((l) => l.label).join(", ")}.`;
}
