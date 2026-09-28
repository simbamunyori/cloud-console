import type { PrismaClient } from "@prisma/client";

/** Customer accounts as staff see them. Reading is not logged; every change staff make is. */

export async function listCustomers(db: PrismaClient, query = "") {
  const q = query.trim();
  return db.organisation.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { memberships: { some: { user: { email: { contains: q, mode: "insensitive" } } } } }] }
      : {},
    orderBy: { name: "asc" },
    take: 100,
    include: {
      memberships: { where: { role: "OWNER", active: true }, include: { user: { select: { name: true, email: true } } }, take: 1 },
      _count: { select: { memberships: { where: { active: true } }, orders: { where: { status: "SETTING_UP" } } } },
    },
  });
}

export async function customerDetail(db: PrismaClient, organisationId: string) {
  const organisation = await db.organisation.findUnique({
    where: { id: organisationId },
    include: {
      memberships: { where: { active: true }, include: { user: { select: { name: true, email: true, totpEnabled: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!organisation) return null;
  const [orders, audit, eft] = await Promise.all([
    db.order.findMany({ where: { organisationId }, orderBy: { createdAt: "desc" }, take: 20, include: { product: { select: { name: true } } } }),
    db.auditEvent.findMany({ where: { organisationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.eftPayment.findMany({ where: { organisationId, status: "AWAITING_CONFIRMATION" } }),
  ]);
  return { organisation, orders, audit, eft };
}

export async function awaitingEft(db: PrismaClient) {
  return db.eftPayment.findMany({
    where: { status: "AWAITING_CONFIRMATION" },
    orderBy: { createdAt: "asc" },
    include: { organisation: { select: { id: true, name: true } } },
  });
}

export async function recentOrders(db: PrismaClient) {
  return db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { organisation: { select: { id: true, name: true } }, product: { select: { name: true } } },
  });
}

/** Counts for the staff overview. */
export async function staffOverview(db: PrismaClient, now = new Date()) {
  const [openTasks, lateTasks, eft, settingUp, tickets, waitlist] = await Promise.all([
    db.provisioningTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.provisioningTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, expectedBy: { lt: now } } }),
    db.eftPayment.count({ where: { status: "AWAITING_CONFIRMATION" } }),
    db.order.count({ where: { status: "SETTING_UP" } }),
    db.ticket.count({ where: { status: "OPEN", deletedAt: null } }),
    db.waitlistEntry.count({ where: { contactedAt: null } }),
  ]);
  return { openTasks, lateTasks, eft, settingUp, tickets, waitlist };
}
