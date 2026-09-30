import type { PrismaClient } from "@prisma/client";
import { hashPassword, passwordStrength } from "@/server/auth/password";

/**
 * Server set-up steps that run from the command line on the production
 * server (scripts/ops.ts, `deploy/console` on the server), before the app
 * is up or before anyone can sign in to /admin.
 */

type Db = Pick<PrismaClient, "market" | "user" | "staffAuditEvent" | "$transaction">;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYSTEM = { actorUserId: "system", actorLabel: "Server set-up" };

/**
 * Gives every market still on the development support address the real one
 * from SUPPORT_EMAIL, so a new server can start. Markets already set by
 * staff are left alone. Returns the market codes changed.
 */
export async function fillSupportEmail(db: Db, email: string | undefined): Promise<string[]> {
  if (!email) return [];
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address) || /@localhost\b/.test(address)) throw new Error(`SUPPORT_EMAIL "${email}" is not a real email address.`);
  const markets = await db.market.findMany({ where: { supportEmail: { contains: "@localhost" } }, select: { code: true, supportEmail: true } });
  if (!markets.length) return [];
  await db.$transaction(async (tx) => {
    for (const m of markets) {
      await tx.market.update({ where: { code: m.code }, data: { supportEmail: address } });
      await tx.staffAuditEvent.create({
        data: { ...SYSTEM, action: "market.support_email", summary: `Set the ${m.code} support email to ${address} from SUPPORT_EMAIL`, data: { market: m.code, from: m.supportEmail, to: address } },
      });
    }
  });
  return markets.map((m) => m.code);
}

/**
 * Creates a staff Admin who can also publish the website. They set up
 * their authenticator app the first time they sign in at /admin.
 */
export async function createAdmin(db: Db, input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new Error("Give the admin's full name.");
  if (!EMAIL.test(email)) throw new Error(`"${input.email}" is not an email address.`);
  if (passwordStrength(input.password, [email, name]) !== "strong") throw new Error("Choose a password of at least 12 characters that isn't easy to guess.");
  const existing = await db.user.findUnique({ where: { email }, select: { kind: true } });
  if (existing) throw new Error(`${email} already has ${existing.kind === "STAFF" ? "a staff" : "a customer"} account.`);
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { kind: "STAFF", staffRole: "ADMIN", websiteRole: "PUBLISHER", name, email, passwordHash } });
    await tx.staffAuditEvent.create({ data: { ...SYSTEM, action: "staff.created", summary: `Created the staff Admin ${name} (${email}) on the server`, data: { userId: user.id, email } } });
    return user;
  });
}
