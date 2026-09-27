import { Prisma, type PrismaClient } from "@prisma/client";
import type { BillingAdapter } from "./adapter";

/**
 * One console organisation is one billing client (a WHMCS client from
 * Phase 2). The link is stored in BillingAccount and made once, at
 * sign-up, or the first time billing is opened if that failed.
 */
export async function ensureBillingAccount(db: PrismaClient, adapter: BillingAdapter, organisationId: string) {
  const existing = await db.billingAccount.findUnique({ where: { organisationId } });
  if (existing) {
    if (existing.provider !== adapter.provider) {
      throw new Error(`Organisation ${organisationId} is linked to ${existing.provider} billing, but the console is set to ${adapter.provider}.`);
    }
    return existing;
  }
  const org = await db.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    include: { memberships: { where: { role: "OWNER", active: true }, orderBy: { createdAt: "asc" }, take: 1, include: { user: true } } },
  });
  const owner = org.memberships[0]?.user;
  if (!owner) throw new Error(`Organisation ${organisationId} has no owner to put on the billing account.`);
  const [firstName, ...rest] = owner.name.trim().split(/\s+/);
  const { clientId } = await adapter.createClient({
    companyName: org.name,
    firstName,
    lastName: rest.join(" ") || firstName,
    email: org.billingEmail ?? owner.email,
    country: org.country,
    currency: org.currency,
    address1: org.addressLine1 ?? undefined,
    city: org.city ?? undefined,
    phone: org.phone ?? undefined,
    taxId: org.vatNumber ?? undefined,
  });
  try {
    return await db.billingAccount.create({ data: { organisationId, provider: adapter.provider, externalClientId: clientId } });
  } catch (e) {
    // Two requests raced; the first link wins. The spare client is harmless
    // in the stub, and in WHMCS staff would close it (it has no services).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.billingAccount.findUniqueOrThrow({ where: { organisationId } });
    }
    throw e;
  }
}
