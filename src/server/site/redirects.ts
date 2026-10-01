import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * Old website addresses and where they go now (Milestone 10). The proxy
 * asks on every page request, so the table is kept in memory and read
 * again at most once a minute; staff changes show within that minute, or
 * at once on the server that made them. No "server-only" here: the proxy
 * imports it.
 */

/** The old WordPress site lived under /new/: anything there not listed goes home. */
export const OLD_SITE_PREFIX = "/new";

/** Lower case, no trailing slash, no doubled slashes. "/" stays "/". */
export function normalisePath(path: string): string {
  let p = path.toLowerCase().replace(/\/{2,}/g, "/");
  try {
    p = decodeURI(p);
  } catch {
    // Keep it as it came.
  }
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** Where an old path goes: a listed address, else home for anything under the old site's folder. */
export function matchRedirect(path: string, table: ReadonlyMap<string, string>): { to: string; listed: boolean } | null {
  const p = normalisePath(path);
  const listed = table.get(p);
  if (listed) return { to: listed, listed: true };
  if (p === OLD_SITE_PREFIX || p.startsWith(`${OLD_SITE_PREFIX}/`)) return { to: "/", listed: false };
  return null;
}

const TTL_MS = 60_000;
let cached: { at: number; table: Map<string, string> } | null = null;

export function forgetRedirects() {
  cached = null;
}

async function table(db: Pick<PrismaClient, "siteRedirect">, now: number): Promise<Map<string, string>> {
  if (cached && now - cached.at < TTL_MS) return cached.table;
  const rows = await db.siteRedirect.findMany({ select: { fromPath: true, toPath: true } });
  cached = { at: now, table: new Map(rows.map((r) => [r.fromPath, r.toPath])) };
  return cached.table;
}

/**
 * The redirect for a request path, or null. Counts the visit without
 * waiting for it. A database that can't be reached never stops the page:
 * it simply isn't redirected.
 */
export async function findRedirect(path: string, db: Pick<PrismaClient, "siteRedirect"> = prisma, now = Date.now()): Promise<string | null> {
  try {
    const hit = matchRedirect(path, await table(db, now));
    if (!hit) return null;
    if (hit.listed) {
      db.siteRedirect.updateMany({ where: { fromPath: normalisePath(path) }, data: { hits: { increment: 1 }, lastHitAt: new Date(now) } }).catch(() => {});
    }
    return hit.to;
  } catch (e) {
    console.error("Redirects not checked:", e instanceof Error ? e.message : e);
    return null;
  }
}
