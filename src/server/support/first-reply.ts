import type { PrismaClient } from "@prisma/client";

/**
 * The median time to the first reply our team sends a customer, over the
 * last 90 days of support tickets, for the public site's proof figures
 * (docs/FINAL_BUILD.md, Milestone 4). Only a count leaves this module, never
 * anything about a customer. Staff notes don't count as a reply.
 */

export const FIRST_REPLY_DAYS = 90;
/** Fewer answered tickets than this and the figure says too little, so it hides. */
export const FIRST_REPLY_MIN_TICKETS = 30;

/** The median of the waits, in minutes, or null with fewer than 30 answered tickets. */
export function medianFirstReplyMinutes(waitsMs: number[]): number | null {
  if (waitsMs.length < FIRST_REPLY_MIN_TICKETS) return null;
  const sorted = [...waitsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.max(1, Math.round(median / 60_000));
}

/** "12 min" (or "12 minutes" in a sentence), "3 hours", "2 days". */
export function formatReplyTime(minutes: number, style: "short" | "long" = "short"): string {
  if (minutes < 60) return style === "short" ? `${minutes} min` : minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

/** The median first reply in minutes, or null while there are too few answered tickets. */
export async function medianFirstReply(db: PrismaClient, now = new Date()): Promise<number | null> {
  const since = new Date(now.getTime() - FIRST_REPLY_DAYS * 86_400_000);
  const tickets = await db.ticket.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    select: { createdAt: true, messages: { where: { authorKind: "STAFF", internal: false }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } },
  });
  const waits = tickets.flatMap((t) => (t.messages[0] ? [t.messages[0].createdAt.getTime() - t.createdAt.getTime()] : []));
  return medianFirstReplyMinutes(waits);
}
