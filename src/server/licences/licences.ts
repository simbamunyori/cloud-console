import type { LicenceChange, LicenceChangeKind, Prisma, PrismaClient, TenantVendor } from "@prisma/client";
import type { TenantDb } from "@/server/db";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { VENDOR_LABEL, type TenantProvider } from "./provider";

/**
 * Users and licences in customers' Microsoft 365 and Google Workspace
 * tenants. The console keeps its own copy of who holds which licence. A
 * customer's change goes to the tenant provider: done at once when it is
 * automatic, otherwise a staff task, with the change pending until the
 * task is done. Unused licences (bought but held by no one) are flagged,
 * because they are money spent on nothing.
 */

type Tx = Pick<Prisma.TransactionClient, "tenant" | "tenantUser" | "tenantLicence" | "licenceAssignment" | "licenceChange" | "provisioningTask" | "auditEvent">;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Reading ─────────────────────────────────────────────────────────

export interface LicenceView {
  id: string;
  sku: string;
  name: string;
  purchased: number;
  assigned: number;
  /** Bought but held by no one. */
  unused: number;
  /** What can still be given out, after changes already waiting. */
  free: number;
}

export interface PendingView {
  id: string;
  kind: LicenceChangeKind;
  licenceName: string | null;
  createdAt: Date;
}

export interface TenantUserView {
  id: string;
  email: string;
  name: string;
  enabled: boolean;
  lastSignInAt: Date | null;
  licences: { id: string; name: string }[];
  pending: PendingView[];
}

export interface TenantView {
  id: string;
  vendor: TenantVendor;
  vendorLabel: string;
  primaryDomain: string;
  lastSyncedAt: Date | null;
  licences: LicenceView[];
  users: TenantUserView[];
  /** People asked for who don't exist in the tenant yet. */
  pendingUsers: { id: string; email: string; name: string; licenceName: string | null; createdAt: Date }[];
}

type ReadDb = Pick<TenantDb, "tenant"> | Pick<PrismaClient, "tenant">;

/** Every tenant of the organisation, with its licences and people. Pass the organisation id when reading unscoped (staff). */
export async function tenantOverview(db: ReadDb, organisationId?: string): Promise<TenantView[]> {
  const tenants = await (db.tenant as PrismaClient["tenant"]).findMany({
    where: organisationId ? { organisationId } : {},
    orderBy: { vendor: "asc" },
    include: {
      licences: { orderBy: { name: "asc" }, include: { _count: { select: { assignments: true } } } },
      users: { orderBy: [{ enabled: "desc" }, { name: "asc" }], include: { assignments: { include: { licence: { select: { id: true, name: true } } } } } },
      changes: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { licence: { select: { name: true } } } },
    },
  });
  return tenants.map((t) => {
    const waitingFor = (licenceId: string) => t.changes.filter((c) => c.licenceId === licenceId && (c.kind === "ASSIGN" || c.kind === "ADD_USER")).length;
    return {
      id: t.id,
      vendor: t.vendor,
      vendorLabel: VENDOR_LABEL[t.vendor],
      primaryDomain: t.primaryDomain,
      lastSyncedAt: t.lastSyncedAt,
      licences: t.licences.map((l) => {
        const assigned = l._count.assignments;
        return { id: l.id, sku: l.sku, name: l.name, purchased: l.purchased, assigned, unused: Math.max(0, l.purchased - assigned), free: Math.max(0, l.purchased - assigned - waitingFor(l.id)) };
      }),
      users: t.users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        enabled: u.enabled,
        lastSignInAt: u.lastSignInAt,
        licences: u.assignments.map((a) => a.licence),
        pending: t.changes.filter((c) => c.tenantUserId === u.id).map((c) => ({ id: c.id, kind: c.kind, licenceName: c.licence?.name ?? null, createdAt: c.createdAt })),
      })),
      pendingUsers: t.changes
        .filter((c) => c.kind === "ADD_USER" && !c.tenantUserId)
        .map((c) => ({ id: c.id, email: c.email ?? "", name: c.name ?? "", licenceName: c.licence?.name ?? null, createdAt: c.createdAt })),
    };
  });
}

export interface UnusedLicence {
  vendorLabel: string;
  name: string;
  unused: number;
  purchased: number;
}

/** Licences bought but held by no one, for the Home page. */
export function unusedLicences(tenants: TenantView[]): UnusedLicence[] {
  return tenants.flatMap((t) => t.licences.filter((l) => l.unused > 0).map((l) => ({ vendorLabel: t.vendorLabel, name: l.name, unused: l.unused, purchased: l.purchased })));
}

// ─── Customer changes ────────────────────────────────────────────────

export type ChangeInput =
  | { kind: "ASSIGN"; tenantUserId: string; licenceId: string }
  | { kind: "UNASSIGN"; tenantUserId: string; licenceId: string }
  | { kind: "ADD_USER"; tenantId: string; name: string; email: string; licenceId?: string }
  | { kind: "REMOVE_USER"; tenantUserId: string };

const DONE_SUMMARY: Record<LicenceChangeKind, (who: string, licence?: string) => string> = {
  ASSIGN: (who, l) => `Gave ${who} a ${l} licence`,
  UNASSIGN: (who, l) => `Took back ${who}'s ${l} licence`,
  ADD_USER: (who, l) => `Added ${who}${l ? ` with a ${l} licence` : ""}`,
  REMOVE_USER: (who) => `Removed ${who} and freed their licences`,
};

const ASKED_SUMMARY: Record<LicenceChangeKind, (who: string, licence?: string) => string> = {
  ASSIGN: (who, l) => `Asked for ${who} to get a ${l} licence`,
  UNASSIGN: (who, l) => `Asked to take back ${who}'s ${l} licence`,
  ADD_USER: (who, l) => `Asked to add ${who}${l ? ` with a ${l} licence` : ""}`,
  REMOVE_USER: (who) => `Asked to remove ${who} and free their licences`,
};

async function freeCount(tx: Tx, licence: { id: string; purchased: number }) {
  const [assigned, waiting] = await Promise.all([
    tx.licenceAssignment.count({ where: { licenceId: licence.id } }),
    tx.licenceChange.count({ where: { licenceId: licence.id, status: "PENDING", kind: { in: ["ASSIGN", "ADD_USER"] } } }),
  ]);
  return licence.purchased - assigned - waiting;
}

function noneFree(name: string, purchased: number) {
  return new DomainError("conflict", `All ${purchased} ${name} licences are in use. Take one back from someone, or add licences from Services.`, "licenceId");
}

/**
 * A customer's change to their tenant. Checked here, then handed to the
 * provider: applied now when it is automatic, otherwise left pending with
 * a staff task. Either way it is in the customer's audit log.
 */
export async function requestLicenceChange(
  db: TenantDb,
  ctx: { organisationId: string; organisationName: string; actor: Actor; provider: TenantProvider; now?: Date },
  input: ChangeInput,
): Promise<{ change: LicenceChange; applied: boolean }> {
  assertCan(ctx.actor, "manageLicences");
  const now = ctx.now ?? new Date();

  return db.$transaction(async (tx) => {
    const t = tx as unknown as Tx;
    let tenant: { id: string; vendor: TenantVendor; primaryDomain: string };
    let user: { id: string; name: string; email: string } | null = null;
    let licence: { id: string; name: string; purchased: number; tenantId: string } | null = null;
    let freed: string[] = [];

    if (input.kind === "ADD_USER") {
      const found = await t.tenant.findFirst({ where: { id: input.tenantId } });
      if (!found) throw new DomainError("not-found", "No such tenant.");
      tenant = found;
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      const errors: Record<string, string> = {};
      if (!name) errors.name = "Enter their name.";
      if (!EMAIL.test(email)) errors.email = "Enter an email address like name@example.co.bw.";
      if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
      if (await t.tenantUser.findFirst({ where: { tenantId: tenant.id, email } })) throw new DomainError("conflict", `${email} is already in ${tenant.primaryDomain}.`, "email");
      if (await t.licenceChange.findFirst({ where: { tenantId: tenant.id, status: "PENDING", kind: "ADD_USER", email } })) throw new DomainError("conflict", `Adding ${email} is already waiting for our team.`, "email");
      user = { id: "", name, email };
    } else {
      const found = await t.tenantUser.findFirst({ where: { id: input.tenantUserId }, include: { tenant: true, assignments: { include: { licence: { select: { name: true } } } } } });
      if (!found) throw new DomainError("not-found", "No such person.");
      tenant = found.tenant;
      user = found;
      if (!found.enabled) throw new DomainError("conflict", `${found.name} has been removed.`);
      if (await t.licenceChange.findFirst({ where: { tenantUserId: found.id, status: "PENDING" } })) throw new DomainError("conflict", `A change for ${found.name} is already waiting for our team. Try again once it's done.`);
      freed = found.assignments.map((a) => a.licence.name);
    }

    if (input.kind !== "REMOVE_USER" && input.licenceId) {
      licence = await t.tenantLicence.findFirst({ where: { id: input.licenceId, tenantId: tenant.id } });
      if (!licence) throw new DomainError("not-found", "No such licence in this tenant.", "licenceId");
      const held = user.id ? await t.licenceAssignment.findFirst({ where: { tenantUserId: user.id, licenceId: licence.id } }) : null;
      if (input.kind === "ASSIGN" && held) throw new DomainError("conflict", `${user.name} already has a ${licence.name} licence.`, "licenceId");
      if (input.kind === "UNASSIGN" && !held) throw new DomainError("conflict", `${user.name} doesn't have a ${licence.name} licence.`, "licenceId");
      if ((input.kind === "ASSIGN" || input.kind === "ADD_USER") && (await freeCount(t, licence)) <= 0) throw noneFree(licence.name, licence.purchased);
    }

    const change = await t.licenceChange.create({
      data: {
        organisationId: ctx.organisationId,
        tenantId: tenant.id,
        kind: input.kind,
        tenantUserId: user.id || null,
        licenceId: licence?.id ?? null,
        email: input.kind === "ADD_USER" ? user.email : null,
        name: input.kind === "ADD_USER" ? user.name : null,
        requestedById: ctx.actor.userId,
      },
    });

    const result = await ctx.provider.submit(
      t,
      { organisationId: ctx.organisationId, organisationName: ctx.organisationName, vendor: tenant.vendor, primaryDomain: tenant.primaryDomain, kind: input.kind, userName: user.name, userEmail: user.email, licenceName: licence?.name, freedLicences: freed },
      now,
    );
    const who = `${user.name} (${user.email})`;
    if (result.applied) {
      const done = await applyLicenceChange(t, change.id, now);
      await audit(t, customerAudit(ctx.actor, ctx.organisationId, { action: `licence.${input.kind.toLowerCase()}`, summary: DONE_SUMMARY[input.kind](who, licence?.name), targetType: "Tenant", targetId: tenant.id }));
      return { change: done, applied: true };
    }
    const pending = await t.licenceChange.update({ where: { id: change.id }, data: { taskId: result.taskId ?? null } });
    await audit(t, customerAudit(ctx.actor, ctx.organisationId, { action: `licence.${input.kind.toLowerCase()}_requested`, summary: ASKED_SUMMARY[input.kind](who, licence?.name), targetType: "Tenant", targetId: tenant.id }));
    return { change: pending, applied: false };
  });
}

/** Makes a change true in the console's copy of the tenant, and marks it done. */
export async function applyLicenceChange(tx: Tx, changeId: string, now: Date): Promise<LicenceChange> {
  const c = await tx.licenceChange.findUniqueOrThrow({ where: { id: changeId } });
  if (c.status !== "PENDING") return c;
  let userId = c.tenantUserId;
  switch (c.kind) {
    case "ASSIGN":
      if (!(await tx.licenceAssignment.findFirst({ where: { tenantUserId: userId!, licenceId: c.licenceId! } }))) {
        await tx.licenceAssignment.create({ data: { organisationId: c.organisationId, tenantUserId: userId!, licenceId: c.licenceId! } });
      }
      break;
    case "UNASSIGN":
      await tx.licenceAssignment.deleteMany({ where: { tenantUserId: userId!, licenceId: c.licenceId! } });
      break;
    case "ADD_USER": {
      const existing = await tx.tenantUser.findFirst({ where: { tenantId: c.tenantId, email: c.email! } });
      const user = existing ?? (await tx.tenantUser.create({ data: { organisationId: c.organisationId, tenantId: c.tenantId, email: c.email!, name: c.name! } }));
      userId = user.id;
      if (c.licenceId && !(await tx.licenceAssignment.findFirst({ where: { tenantUserId: user.id, licenceId: c.licenceId } }))) {
        await tx.licenceAssignment.create({ data: { organisationId: c.organisationId, tenantUserId: user.id, licenceId: c.licenceId } });
      }
      break;
    }
    case "REMOVE_USER":
      await tx.licenceAssignment.deleteMany({ where: { tenantUserId: userId! } });
      await tx.tenantUser.update({ where: { id: userId! }, data: { enabled: false } });
      break;
  }
  return tx.licenceChange.update({ where: { id: c.id }, data: { status: "DONE", completedAt: now, tenantUserId: userId } });
}

/** Applies every change waiting on a task that staff just finished. Called from completeTask. */
export async function applyChangesForTask(tx: Tx, taskId: string, now: Date): Promise<number> {
  const waiting = await tx.licenceChange.findMany({ where: { taskId, status: "PENDING" }, select: { id: true } });
  for (const w of waiting) await applyLicenceChange(tx, w.id, now);
  return waiting.length;
}

// ─── Staff record keeping ────────────────────────────────────────────

/**
 * Until the vendor APIs are connected, staff keep the console's copy in
 * step with the partner portal: link a tenant, set how many licences were
 * bought, and record people. Each step is in the customer's audit log.
 */
export interface StaffRecordDeps {
  db: PrismaClient;
  staff: StaffActor;
  now?: Date;
}

const VENDORS: TenantVendor[] = ["MICROSOFT", "GOOGLE"];
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function linkTenant(deps: StaffRecordDeps, organisationId: string, input: { vendor: string; primaryDomain: string; vendorTenantId?: string }) {
  assertStaffCan(deps.staff, "workTasks");
  const vendor = input.vendor as TenantVendor;
  const domain = input.primaryDomain.trim().toLowerCase();
  if (!VENDORS.includes(vendor)) throw new DomainError("invalid", "Choose Microsoft 365 or Google Workspace.", "vendor");
  if (!DOMAIN.test(domain)) throw new DomainError("invalid", "Enter the domain people sign in with, like kgalehill.co.bw.", "primaryDomain");
  return deps.db.$transaction(async (tx) => {
    if (!(await tx.organisation.findUnique({ where: { id: organisationId }, select: { id: true } }))) throw new DomainError("not-found", "No such customer.");
    if (await tx.tenant.findFirst({ where: { organisationId, vendor } })) throw new DomainError("conflict", `This customer already has a ${VENDOR_LABEL[vendor]} tenant.`, "vendor");
    const tenant = await tx.tenant.create({ data: { organisationId, vendor, primaryDomain: domain, vendorTenantId: input.vendorTenantId?.trim() || null, lastSyncedAt: deps.now ?? new Date() } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "tenant.linked", summary: `Linked your ${VENDOR_LABEL[vendor]} tenant ${domain}`, targetType: "Tenant", targetId: tenant.id }));
    return tenant;
  });
}

async function staffTenant(tx: Tx, organisationId: string, tenantId: string) {
  const tenant = await tx.tenant.findFirst({ where: { id: tenantId, organisationId } });
  if (!tenant) throw new DomainError("not-found", "No such tenant for this customer.");
  return tenant;
}

/** Sets how many of a licence the tenant holds, adding the licence if it is new. Never below the number in use. */
export async function recordLicence(deps: StaffRecordDeps, organisationId: string, input: { tenantId: string; sku: string; name: string; purchased: number }) {
  assertStaffCan(deps.staff, "workTasks");
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();
  const errors: Record<string, string> = {};
  if (!/^[A-Z0-9_.-]{2,80}$/.test(sku)) errors.sku = "Enter the SKU as the portal shows it, like O365_BUSINESS_PREMIUM.";
  if (!name) errors.name = "Enter the licence name customers see.";
  if (!Number.isInteger(input.purchased) || input.purchased < 0 || input.purchased > 100_000) errors.purchased = "Enter a whole number of licences.";
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
  return deps.db.$transaction(async (tx) => {
    const tenant = await staffTenant(tx, organisationId, input.tenantId);
    const existing = await tx.tenantLicence.findFirst({ where: { tenantId: tenant.id, sku } });
    if (existing) {
      const inUse = await tx.licenceAssignment.count({ where: { licenceId: existing.id } });
      if (input.purchased < inUse) throw new DomainError("conflict", `${inUse} people hold ${existing.name}. Take licences back before recording fewer.`, "purchased");
    }
    const licence = existing
      ? await tx.tenantLicence.update({ where: { id: existing.id }, data: { name, purchased: input.purchased } })
      : await tx.tenantLicence.create({ data: { organisationId, tenantId: tenant.id, sku, name, purchased: input.purchased } });
    await tx.tenant.update({ where: { id: tenant.id }, data: { lastSyncedAt: deps.now ?? new Date() } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "tenant.licence_recorded", summary: `Recorded ${input.purchased} ${name} ${input.purchased === 1 ? "licence" : "licences"} in ${tenant.primaryDomain}`, targetType: "Tenant", targetId: tenant.id }));
    return licence;
  });
}

/** Records a person as they are in the tenant, with the licences they hold there. */
export async function recordTenantUser(deps: StaffRecordDeps, organisationId: string, input: { tenantId: string; name: string; email: string; licenceIds: string[] }) {
  assertStaffCan(deps.staff, "workTasks");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Enter their name.";
  if (!EMAIL.test(email)) errors.email = "Enter their email address.";
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
  return deps.db.$transaction(async (tx) => {
    const tenant = await staffTenant(tx, organisationId, input.tenantId);
    if (await tx.tenantUser.findFirst({ where: { tenantId: tenant.id, email } })) throw new DomainError("conflict", `${email} is already recorded.`, "email");
    const licences = await tx.tenantLicence.findMany({ where: { tenantId: tenant.id, id: { in: input.licenceIds } } });
    for (const l of licences) if ((await freeCount(tx, l)) <= 0) throw noneFree(l.name, l.purchased);
    const user = await tx.tenantUser.create({ data: { organisationId, tenantId: tenant.id, email, name } });
    for (const l of licences) await tx.licenceAssignment.create({ data: { organisationId, tenantUserId: user.id, licenceId: l.id } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "tenant.user_recorded", summary: `Recorded ${name} (${email}) in ${tenant.primaryDomain}`, targetType: "Tenant", targetId: tenant.id }));
    return user;
  });
}
