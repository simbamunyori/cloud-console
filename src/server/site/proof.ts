import "server-only";
import { cache } from "react";
import type { Announcement, ClientLogo, Partner, ProofNumber, ShowcaseSite, TeamMember, Testimonial } from "@/cms/payload-types";
import { prisma } from "@/server/db";
import { formatReplyTime, medianFirstReply } from "@/server/support/first-reply";
import { cms } from "./cms";

/**
 * The proof the public site shows (docs/FINAL_BUILD.md, Milestone 4), read
 * on the server: only what is approved, for this market, in the editor's
 * order. Every list may be empty, and whatever shows it then hides.
 */

type Marketed = { markets?: string[] | null };

/** Items for every market (none ticked) or this one. */
export const forMarket = <T extends Marketed>(docs: T[], market: string): T[] => docs.filter((d) => !d.markets?.length || d.markets.includes(market));

type ProofSlug = "partners" | "client-logos" | "proof-numbers" | "team-members" | "testimonials" | "showcase-sites";

const approvedDocs = cache(async (slug: ProofSlug, approvedField: string, market: string): Promise<Marketed[]> => {
  const payload = await cms();
  const { docs } = await payload.find({ collection: slug, where: { [approvedField]: { equals: true } }, sort: "_order", depth: 1, pagination: false, overrideAccess: true });
  return forMarket(docs as Marketed[], market);
});
const approvedList = async <T extends Marketed>(slug: ProofSlug, approvedField: string, market: string) => (await approvedDocs(slug, approvedField, market)) as T[];

export const approvedPartners = (market: string) => approvedList<Partner>("partners", "approved", market);
export const permittedClientLogos = (market: string) => approvedList<ClientLogo>("client-logos", "permission", market);
export const permittedTestimonials = (market: string) => approvedList<Testimonial>("testimonials", "permission", market);
export const permittedShowcaseSites = (market: string) => approvedList<ShowcaseSite>("showcase-sites", "permission", market);

/** Team members who are visible and have a photo. */
export const visibleTeam = cache(async (market: string) => (await approvedList<TeamMember>("team-members", "visible", market)).filter((m) => m.photo && typeof m.photo === "object"));

/** The median first reply over the last 90 days, in minutes, or null with too few answered tickets. Once per request. */
export const firstReplyMinutes = cache(() => medianFirstReply(prisma));

/** Visible proof numbers, with calculated figures filled in; one that can't be worked out yet hides. */
export const visibleProofNumbers = cache(async (market: string): Promise<{ id: number; value: string; label: string }[]> => {
  const numbers = await approvedList<ProofNumber>("proof-numbers", "visible", market);
  const needsReply = numbers.some((n) => n.calculated === "medianFirstReply");
  const reply = needsReply ? await firstReplyMinutes() : null;
  return numbers.flatMap((n) => {
    const value = n.calculated === "medianFirstReply" ? (reply === null ? null : formatReplyTime(reply)) : n.value?.trim();
    return value ? [{ id: n.id, value, label: n.label }] : [];
  });
});

/** The first approved partner marked for the email section and menu, if any. */
export const emailPartner = cache(async (market: string) => (await approvedPartners(market)).find((p) => p.feature === "email") ?? null);

/** Whether an announcement is up at `now`, for this market. */
export function announcementLive(a: Pick<Announcement, "text" | "startsAt" | "endsAt" | "markets"> | null | undefined, market: string, now = new Date()): boolean {
  if (!a?.text?.trim()) return false;
  if (a.markets?.length && !a.markets.includes(market as never)) return false;
  if (a.startsAt && new Date(a.startsAt) > now) return false;
  if (a.endsAt && new Date(a.endsAt) <= now) return false;
  return true;
}

export const liveAnnouncement = cache(async (market: string) => {
  const payload = await cms();
  const a = await payload.findGlobal({ slug: "announcement", depth: 0, overrideAccess: true });
  return announcementLive(a, market) ? a : null;
});
