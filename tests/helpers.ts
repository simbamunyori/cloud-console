/**
 * Shared set-up for tests that use a real PostgreSQL database. They are
 * skipped when DATABASE_URL is not set.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import { confirmAuthenticatorSetup, beginAuthenticatorSetup, signUp, type AuthDeps } from "../src/server/auth/service";
import { totpAt } from "../src/server/auth/totp";
import { tenantDb } from "../src/server/db";
import type { Actor } from "../src/server/org/access";

export const hasDb = Boolean(process.env.DATABASE_URL);
export const db = hasDb ? new PrismaClient() : (undefined as unknown as PrismaClient);

export function testDeps(now?: () => Date): AuthDeps {
  return { db, encryptionKey: randomBytes(32).toString("base64"), issuer: "Cloud Console", now };
}

export const PASSWORD = "correct-horse-battery";

export function uniqueEmail(label: string) {
  return `${label}+${Date.now().toString(36)}${randomBytes(3).toString("hex")}@example.co.bw`;
}

/** A signed-up organisation with its owner fully signed in. */
export async function makeOrganisation(name = "Mogoditshane Movers") {
  const deps = testDeps();
  const email = uniqueEmail("owner");
  const { token, organisationId, userId } = await signUp(deps, { organisationName: name, name: "Neo Kgosi", email, password: PASSWORD });
  const { secret } = await beginAuthenticatorSetup(deps, token);
  await confirmAuthenticatorSetup(deps, token, totpAt(secret));
  const membership = await db.membership.findFirstOrThrow({ where: { organisationId, userId } });
  const owner: Actor = { membershipId: membership.id, userId, name: "Neo Kgosi", role: "OWNER" };
  return { organisationId, owner, email, tenant: tenantDb(organisationId) };
}

/** Adds someone to an organisation directly, with a given role. */
export async function addMember(organisationId: string, role: Role, name = "Mpho Dube"): Promise<Actor> {
  const user = await db.user.create({ data: { email: uniqueEmail(role.toLowerCase()), name, passwordHash: "x", totpEnabled: true } });
  const m = await db.membership.create({ data: { organisationId, userId: user.id, role } });
  return { membershipId: m.id, userId: user.id, name, role };
}
