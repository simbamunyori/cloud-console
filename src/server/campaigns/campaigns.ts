import type { CampaignEventKind, PrismaClient } from "@prisma/client";

/**
 * Tracked links (final build, Milestone 7): every link in a launch kit
 * carries utm_campaign, utm_source and utm_medium. A visit through one
 * leaves the tags in a cookie, and a lead, quote request or sign-up from
 * that browser is counted against the campaign. Orders are counted
 * through the organisations that signed up.
 */

export const CAMPAIGN_COOKIE = "console_campaign";
/** How long a visit keeps counting towards its campaign. */
export const CAMPAIGN_DAYS = 30;

export interface Touch {
  campaign: string;
  source: string | null;
  medium: string | null;
}

const TAG = /^[a-z0-9][a-z0-9._-]{0,59}$/;
const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return TAG.test(s) ? s : null;
};

/** A touch from link tags, or null when there is no usable campaign. */
export function touchFrom(tags: { campaign?: unknown; source?: unknown; medium?: unknown }): Touch | null {
  const campaign = clean(tags.campaign);
  return campaign ? { campaign, source: clean(tags.source), medium: clean(tags.medium) } : null;
}

export const encodeTouch = (t: Touch) => [t.campaign, t.source ?? "", t.medium ?? ""].join("|");
export function decodeTouch(value: string | undefined): Touch | null {
  if (!value) return null;
  const [campaign, source, medium] = value.split("|");
  return touchFrom({ campaign, source, medium });
}

/** A link with the campaign's tags added. */
export function tracked(url: string, t: { campaign: string; source: string; medium: string; content?: string }): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", t.source);
  u.searchParams.set("utm_medium", t.medium);
  u.searchParams.set("utm_campaign", t.campaign);
  if (t.content) u.searchParams.set("utm_content", t.content);
  return u.toString();
}

export async function recordCampaign(db: Pick<PrismaClient, "campaignEvent">, touch: Touch | null, kind: CampaignEventKind, ref?: string) {
  if (!touch) return;
  await db.campaignEvent.create({ data: { campaign: touch.campaign, source: touch.source, medium: touch.medium, kind, ref: ref ?? null } });
}

export interface CampaignCounts {
  visits: number;
  leads: number;
  quotes: number;
  signUps: number;
  orders: number;
  /** Visits by where they came from, e.g. "linkedin / social". */
  bySource: { label: string; visits: number }[];
}

/** What a campaign has brought so far. */
export async function campaignReport(db: Pick<PrismaClient, "campaignEvent" | "order">, campaign: string): Promise<CampaignCounts> {
  const events = await db.campaignEvent.groupBy({ by: ["kind", "source", "medium"], where: { campaign }, _count: { _all: true } });
  const count = (k: CampaignEventKind) => events.filter((e) => e.kind === k).reduce((n, e) => n + e._count._all, 0);
  const orgs = await db.campaignEvent.findMany({ where: { campaign, kind: "SIGN_UP", ref: { not: null } }, select: { ref: true } });
  const orders = orgs.length ? await db.order.count({ where: { organisationId: { in: orgs.map((o) => o.ref!) } } }) : 0;
  const bySource = events
    .filter((e) => e.kind === "VISIT")
    .map((e) => ({ label: [e.source ?? "unknown", e.medium].filter(Boolean).join(" / "), visits: e._count._all }))
    .sort((a, b) => b.visits - a.visits);
  return { visits: count("VISIT"), leads: count("LEAD"), quotes: count("QUOTE"), signUps: count("SIGN_UP"), orders, bySource };
}
