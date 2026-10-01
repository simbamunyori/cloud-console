import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, type UserKind } from "@prisma/client";

/**
 * Signed-in sessions for browser tests and screenshots, made straight in
 * the database for the seeded demo accounts. Development and CI databases
 * only: it refuses to run in production.
 */

export const DEMO_CUSTOMER = "demo@kgalehill.co.bw";
export const DEMO_STAFF = "staff@example.co.bw";

const COOKIE: Record<UserKind, string> = { CUSTOMER: "console_session", STAFF: "console_staff" };

/**
 * `confirmed` makes the session count as recently checked for the whole run
 * (sensitive actions ask for a passkey or code otherwise).
 */
export async function testSession(email: string, { confirmed = true }: { confirmed?: boolean } = {}): Promise<{ name: string; value: string }> {
  if (process.env.NODE_ENV === "production") throw new Error("Test sessions are for development and CI only.");
  const db = new PrismaClient();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email }, include: { memberships: { where: { active: true }, take: 1 } } });
    const token = randomBytes(32).toString("base64url");
    await db.session.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        userId: user.id,
        audience: user.kind,
        stage: "ACTIVE",
        activeOrganisationId: user.memberships[0]?.organisationId ?? null,
        expiresAt: new Date(Date.now() + 8 * 3_600_000),
        stepUpAt: confirmed ? new Date(Date.now() + 8 * 3_600_000) : null,
        userAgent: "test session",
      },
    });
    return { name: COOKIE[user.kind], value: token };
  } finally {
    await db.$disconnect();
  }
}
