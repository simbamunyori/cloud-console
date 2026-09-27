import type { PrismaClient } from "@prisma/client";
import type { TenantDb } from "@/server/db";
import { can, type Actor } from "./access";

/**
 * What the Security page shows. The page is built from cards so later
 * phases (security score, protected devices, SOC alerts, Botswana Copy,
 * compliance documents) add a card without changing the rest.
 */

export async function signInHistory(db: PrismaClient, tenant: TenantDb, actor: Actor, opts: { everyone: boolean; take?: number }) {
  const everyone = opts.everyone && can(actor, "viewSecurity");
  const userIds = everyone ? (await tenant.membership.findMany({ where: { active: true }, select: { userId: true } })).map((m) => m.userId) : [actor.userId];
  const events = await db.signInEvent.findMany({
    where: { userId: { in: userIds } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 30,
  });
  return { everyone, events };
}

export async function twoStepCoverage(tenant: TenantDb) {
  const members = await tenant.membership.findMany({ where: { active: true }, include: { user: { select: { totpEnabled: true } } } });
  return { total: members.length, on: members.filter((m) => m.user.totpEnabled).length };
}

export async function auditLog(tenant: TenantDb, opts: { take?: number; before?: Date } = {}) {
  return tenant.auditEvent.findMany({
    where: { visibleToCustomer: true, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

export async function recoveryCodesLeft(db: PrismaClient, userId: string) {
  return db.recoveryCode.count({ where: { userId, usedAt: null } });
}
