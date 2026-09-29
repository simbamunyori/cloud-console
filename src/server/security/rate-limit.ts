import type { PrismaClient } from "@prisma/client";

/**
 * Fixed-window counters kept in PostgreSQL, so every copy of the app
 * shares them. One atomic statement per hit.
 */

export interface Limit {
  /** Most hits allowed in one window. */
  max: number;
  windowMs: number;
}

export const LIMITS = {
  /** Password attempts from one address. Per-account lockout is separate. */
  signInPerIp: { max: 20, windowMs: 10 * 60_000 },
  /** Code attempts from one address. */
  codePerIp: { max: 30, windowMs: 10 * 60_000 },
  /** New organisations from one address. */
  signUpPerIp: { max: 5, windowMs: 60 * 60_000 },
  /** "Forgot password?" requests from one address. */
  resetPerIp: { max: 10, windowMs: 60 * 60_000 },
  /** "Forgot password?" emails to one account. */
  resetPerEmail: { max: 3, windowMs: 60 * 60_000 },
  /** Quote requests from one address. */
  quotePerIp: { max: 5, windowMs: 60 * 60_000 },
  /** Waiting list sign-ups from one address. */
  waitlistPerIp: { max: 10, windowMs: 60 * 60_000 },
  /** Questions to the assistant from one person. */
  assistantPerUser: { max: 20, windowMs: 10 * 60_000 },
  /** Questions to the assistant from one organisation in a day. */
  assistantPerOrg: { max: 300, windowMs: 24 * 60 * 60_000 },
} satisfies Record<string, Limit>;

export class RateLimitedError extends Error {
  constructor(public readonly retryAt: Date) {
    super("Too many attempts. Try again shortly.");
    this.name = "RateLimitedError";
  }
}

export async function hit(db: Pick<PrismaClient, "$queryRaw">, key: string, limit: Limit, now = new Date()): Promise<{ allowed: boolean; count: number; resetAt: Date }> {
  const resetAt = new Date(now.getTime() + limit.windowMs);
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0];
  return { allowed: row.count <= limit.max, count: row.count, resetAt: row.resetAt };
}

/** Throws RateLimitedError once the limit is passed. */
export async function enforce(db: Pick<PrismaClient, "$queryRaw">, key: string, limit: Limit, now = new Date()) {
  const r = await hit(db, key, limit, now);
  if (!r.allowed) throw new RateLimitedError(r.resetAt);
}
