import type { Prisma, PrismaClient } from "@prisma/client";
import type { Payload } from "payload";
import { insightPath } from "@/cms/collections/insights";
import { DEFAULT_LOCALE, isMarketLocale } from "@/cms/locales";
import { company } from "@/config/app";
import { formatMonth, todayIn } from "@/lib/dates";
import { tracked } from "@/server/campaigns/campaigns";
import { DomainError } from "@/server/org/access";
import { canPublishWebsite, staffLabel, type StaffActor } from "@/server/staff/access";
import type { WebsiteRole } from "@prisma/client";
import { activeSubscribers, unsubscribeUrl } from "./newsletter";

/**
 * The monthly newsletter (docs/FINAL_BUILD.md, Milestone 7). On the 1st
 * an issue is prepared for each market from the insights published there
 * the month before. It waits as a draft until a website Publisher sends
 * it; it goes only to confirmed subscribers, each copy with its own
 * one-click unsubscribe.
 */

export interface IssueItem {
  slug: string;
  title: string;
  summary: string;
  topic: string | null;
}

type Actor = StaffActor & { websiteRole: WebsiteRole | null };
type IssuePayload = Pick<Payload, "find">;

export const DEFAULT_INTRO = "The articles we published last month, in one place. Each one takes a few minutes to read.";

/** "2026-09" for any day in October 2026. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const followingMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** "September 2026" */
export const monthName = (month: string) => formatMonth(new Date(`${month}-01T00:00:00Z`));

/** The tags every newsletter link carries. */
export const newsletterCampaign = (month: string) => `newsletter-${month}`;

/** The insights published in a market during a month, oldest first. */
export async function issueItems(payload: IssuePayload, market: string, month: string): Promise<IssueItem[]> {
  const { docs } = await payload.find({
    collection: "insights",
    where: { and: [{ _status: { equals: "published" } }, { publishedAt: { greater_than_equal: `${month}-01T00:00:00.000Z` } }, { publishedAt: { less_than: `${followingMonth(month)}-01T00:00:00.000Z` } }] },
    sort: "publishedAt",
    locale: isMarketLocale(market) ? market : DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    depth: 0,
    limit: 20,
    overrideAccess: true,
  });
  return docs.filter((d) => d.title && d.summary).map((d) => ({ slug: d.slug, title: d.title, summary: d.summary, topic: d.topic ?? null }));
}

export function itemsOf(value: Prisma.JsonValue): IssueItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const o = (v ?? {}) as Record<string, unknown>;
    return typeof o.slug === "string" && typeof o.title === "string" ? [{ slug: o.slug, title: o.title, summary: typeof o.summary === "string" ? o.summary : "", topic: typeof o.topic === "string" ? o.topic : null }] : [];
  });
}

/**
 * Prepares last month's issue for every market that is switched on and
 * published something. A market with an issue for that month already is
 * left alone, so this is safe to run again.
 */
export async function prepareIssues(deps: { db: PrismaClient; payload: IssuePayload; now?: Date }): Promise<number> {
  const markets = await deps.db.market.findMany({ where: { enabled: true }, select: { code: true, timeZone: true } });
  let prepared = 0;
  for (const m of markets) {
    const month = previousMonth(todayIn(m.timeZone, deps.now ?? new Date()).toISOString().slice(0, 7));
    if (await deps.db.newsletterIssue.findUnique({ where: { market_month: { market: m.code, month } } })) continue;
    const items = await issueItems(deps.payload, m.code, month);
    if (!items.length) continue;
    await deps.db.newsletterIssue
      .create({ data: { market: m.code, month, subject: `${company.name} insights: ${monthName(month)}`, intro: DEFAULT_INTRO, items: items as unknown as Prisma.InputJsonValue } })
      .then(() => prepared++)
      .catch((e: { code?: string }) => {
        // Another worker prepared it first.
        if (e.code !== "P2002") throw e;
      });
  }
  return prepared;
}

function assertWebsiteStaff(actor: Actor) {
  if (!actor.websiteRole) throw new DomainError("forbidden", "The newsletter is for website Editors and Publishers.");
}

export function listIssues(db: PrismaClient, actor: Actor) {
  assertWebsiteStaff(actor);
  return db.newsletterIssue.findMany({ orderBy: [{ month: "desc" }, { market: "asc" }], take: 48 });
}

export async function issueForStaff(db: PrismaClient, actor: Actor, id: string) {
  assertWebsiteStaff(actor);
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue) return null;
  const subscribers = issue.status === "DRAFT" ? await db.newsletterSubscriber.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null, marketCode: issue.market } }) : issue.recipients;
  return { issue, items: itemsOf(issue.items), subscribers };
}

/** Editors and Publishers change the subject and opening words of a draft. */
export async function saveIssue(db: PrismaClient, actor: Actor, id: string, input: { subject: string; intro: string }) {
  assertWebsiteStaff(actor);
  const subject = input.subject.trim().replace(/!/g, ".").slice(0, 120);
  const intro = input.intro.trim().replace(/!/g, ".").slice(0, 800);
  if (!subject) throw new DomainError("invalid", "Enter a subject line.", "subject");
  const done = await db.newsletterIssue.updateMany({ where: { id, status: "DRAFT" }, data: { subject, intro } });
  if (!done.count) throw new DomainError("invalid", "This issue has been sent, so it can't change.");
}

/** Reads the month's published insights again, for articles published after the issue was prepared. */
export async function refreshIssue(db: PrismaClient, payload: IssuePayload, actor: Actor, id: string) {
  assertWebsiteStaff(actor);
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue || issue.status !== "DRAFT") throw new DomainError("invalid", "This issue has been sent, so it can't change.");
  const items = await issueItems(payload, issue.market, issue.month);
  await db.newsletterIssue.update({ where: { id }, data: { items: items as unknown as Prisma.InputJsonValue } });
  return items.length;
}

/**
 * Sends an issue: one queued email per confirmed subscriber in its
 * market. Publishers only. The issue is marked sent first, so pressing
 * Send twice sends once.
 */
export async function sendIssue(db: PrismaClient, actor: Actor, id: string, now = new Date()) {
  if (!canPublishWebsite(actor.websiteRole)) throw new DomainError("forbidden", "Only a website Publisher can send the newsletter.");
  const issue = await db.newsletterIssue.findUnique({ where: { id } });
  if (!issue) throw new DomainError("not-found", "That issue isn't there any more.");
  if (!itemsOf(issue.items).length) throw new DomainError("invalid", "There are no articles in this issue.");
  return db.$transaction(
    async (tx) => {
      const claim = await tx.newsletterIssue.updateMany({ where: { id, status: "DRAFT" }, data: { status: "SENT", sentAt: now, sentById: actor.userId } });
      if (!claim.count) throw new DomainError("invalid", "This issue has already been sent.");
      const subscribers = await activeSubscribers(tx, issue.market);
      await tx.outboundEmail.createMany({ data: subscribers.map((s) => ({ toAddress: s.email, kind: "newsletter.issue", payload: { issueId: id, subscriberId: s.id } })) });
      await tx.newsletterIssue.update({ where: { id }, data: { recipients: subscribers.length } });
      await tx.staffAuditEvent.create({
        data: { actorUserId: actor.userId, actorLabel: staffLabel(actor), action: "newsletter.sent", summary: `Sent the ${monthName(issue.month)} newsletter in ${issue.market.toUpperCase()} to ${subscribers.length} subscribers`, data: { issueId: id, recipients: subscribers.length } },
      });
      return subscribers.length;
    },
    { timeout: 60_000 },
  );
}

/** One subscriber's copy: the articles with tracked links, and the ways to unsubscribe. */
export async function issueEmail(db: Pick<PrismaClient, "newsletterIssue" | "newsletterSubscriber">, appUrl: string, issueId: string, subscriberId: string) {
  const [issue, sub] = await Promise.all([db.newsletterIssue.findUnique({ where: { id: issueId } }), db.newsletterSubscriber.findUnique({ where: { id: subscriberId } })]);
  if (!issue || !sub || !sub.confirmedAt || sub.unsubscribedAt) return null;
  const base = appUrl.replace(/\/$/, "");
  const campaign = newsletterCampaign(issue.month);
  const items = itemsOf(issue.items).map((i) => ({ title: i.title, summary: i.summary, url: tracked(`${base}/${issue.market}${insightPath(i.slug)}`, { campaign, source: "newsletter", medium: "email", content: i.slug }) }));
  const page = unsubscribeUrl(base, sub);
  const oneClick = `${base}/api/newsletter/unsubscribe/${encodeURIComponent(sub.unsubscribeToken)}`;
  return {
    subject: issue.subject,
    heading: monthName(issue.month),
    intro: issue.intro,
    items,
    more: tracked(`${base}/${issue.market}/insights`, { campaign, source: "newsletter", medium: "email", content: "all" }),
    unsubscribe: page,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
