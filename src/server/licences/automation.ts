import { Prisma, type PrismaClient, type TenantConsent, type TenantVendor } from "@prisma/client";
import type { TenantDb } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { licensingFrom, partnerConfig, PARTNERS } from "@/server/partners/partners";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { applyLicenceChange } from "./licences";
import { VENDOR_LABEL } from "./provider";
import { RECONCILE_KIND } from "./reconcile";
import { LicensingVendorError, type LicensingVendor, type VendorCheck } from "./vendor";

/**
 * Microsoft 365 and Google Workspace automation (docs/STRATEGY_ROLLOUT.md,
 * U6), behind "Microsoft 365 automation" and "Google Workspace automation".
 * Every change still makes its setup task first, so the manual fulfilment
 * is always there: when the partner's API takes the change, the task is
 * closed for our team; when it refuses, the task stays open with the
 * reason. A nightly sync compares the partner's numbers with ours and
 * opens a task for each difference, and reads the customer's admin access
 * and security settings for the security score.
 */

export const PARTNER_OF = { MICROSOFT: "microsoft-csp", GOOGLE: "google-reseller" } as const satisfies Record<TenantVendor, string>;
export const FEATURE_OF_VENDOR = { MICROSOFT: "microsoft-licensing", GOOGLE: "google-licensing" } as const satisfies Record<TenantVendor, string>;

/** What the partner calls the tenant: its own id once known, else the domain. */
export const tenantRef = (t: { vendorTenantId: string | null; primaryDomain: string }) => t.vendorTenantId || t.primaryDomain;

type Build = (vendor: TenantVendor) => LicensingVendor | null;

/** The partner's adapter while its automation is on; null means our team does it from the task. */
export async function automationFor(db: Pick<PrismaClient, "featureSwitch" | "partnerSetting">, vendor: TenantVendor, build?: Build): Promise<LicensingVendor | null> {
  if (!(await featureOn(db, FEATURE_OF_VENDOR[vendor]))) return null;
  const config = await partnerConfig(db, PARTNER_OF[vendor]);
  if (!config?.enabled) return null;
  return build ? build(vendor) : licensingFrom(config);
}

export const automationOn = async (db: Pick<PrismaClient, "featureSwitch">, vendor: TenantVendor) => featureOn(db, FEATURE_OF_VENDOR[vendor]);

const partnerLabel = (vendor: TenantVendor) => PARTNERS[PARTNER_OF[vendor]].label;

async function closeTask(tx: Pick<PrismaClient, "provisioningTask">, taskId: string, note: string, now: Date) {
  await tx.provisioningTask.updateMany({ where: { id: taskId, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: now, notes: note } });
}

async function noteTask(db: Pick<PrismaClient, "provisioningTask">, taskId: string | null, note: string) {
  if (!taskId) return;
  const task = await db.provisioningTask.findUnique({ where: { id: taskId }, select: { notes: true } });
  await db.provisioningTask.update({ where: { id: taskId }, data: { notes: [task?.notes, note].filter(Boolean).join("\n").slice(-2000) } });
}

export type PushResult = "done" | "manual" | "failed";

/**
 * Sends a customer's licence change to the partner, after it was saved
 * with its task. Done: the console's copy changes and the task closes.
 * Refused: the task stays for our team, with the reason.
 */
export async function pushLicenceChange(db: PrismaClient, changeId: string, deps: { build?: Build; now?: Date } = {}): Promise<PushResult> {
  const change = await db.licenceChange.findUnique({ where: { id: changeId }, include: { tenant: true, licence: { select: { sku: true } }, user: { select: { email: true, name: true } } } });
  if (!change || change.status !== "PENDING") return "manual";
  const vendor = await automationFor(db, change.tenant.vendor, deps.build);
  if (!vendor) return "manual";
  const now = deps.now ?? new Date();
  let taken: boolean;
  try {
    taken = await vendor.applyChange(tenantRef(change.tenant), { kind: change.kind, email: change.email ?? change.user?.email ?? "", name: change.name ?? change.user?.name ?? "", sku: change.licence?.sku ?? null });
  } catch (e) {
    if (!(e instanceof LicensingVendorError)) throw e;
    await db.licenceChange.update({ where: { id: change.id }, data: { vendorAttempts: { increment: 1 }, vendorError: e.message.slice(0, 500) } });
    await noteTask(db, change.taskId, `${partnerLabel(change.tenant.vendor)} refused it automatically: ${e.message} Please do it by hand.`);
    return "failed";
  }
  if (!taken) return "manual";
  await db.$transaction(async (tx) => {
    await applyLicenceChange(tx, change.id, now);
    await tx.licenceChange.update({ where: { id: change.id }, data: { vendorAttempts: { increment: 1 }, vendorError: null } });
    if (change.taskId) await closeTask(tx, change.taskId, `Done automatically through ${partnerLabel(change.tenant.vendor)}.`, now);
    await audit(tx, { organisationId: change.organisationId, actorKind: "SYSTEM", actorLabel: "Fourth Generation Technologies", action: "licence.change_done", summary: `Your ${VENDOR_LABEL[change.tenant.vendor]} change is done`, targetType: "Tenant", targetId: change.tenantId });
  });
  return "done";
}

/**
 * After a licence count changed in Services (billing already follows it,
 * with proration): sets the same count with the partner, and closes the
 * setup task when it took it.
 */
export async function pushQuantity(db: PrismaClient, input: { organisationId: string; serviceName: string; quantity: number; taskId: string | null }, deps: { build?: Build; now?: Date } = {}): Promise<PushResult> {
  const licence = await db.tenantLicence.findFirst({ where: { organisationId: input.organisationId, name: input.serviceName }, include: { tenant: true } });
  if (!licence) return "manual";
  const vendor = await automationFor(db, licence.tenant.vendor, deps.build);
  if (!vendor) return "manual";
  const now = deps.now ?? new Date();
  try {
    if (!(await vendor.setQuantity(tenantRef(licence.tenant), licence.sku, input.quantity))) return "manual";
  } catch (e) {
    if (!(e instanceof LicensingVendorError)) throw e;
    await noteTask(db, input.taskId, `${partnerLabel(licence.tenant.vendor)} refused the new count automatically: ${e.message} Please do it by hand.`);
    return "failed";
  }
  await db.$transaction(async (tx) => {
    await tx.tenantLicence.update({ where: { id: licence.id }, data: { vendorQuantity: input.quantity, vendorCheckedAt: now } });
    if (input.taskId) await closeTask(tx, input.taskId, `Done automatically through ${partnerLabel(licence.tenant.vendor)}.`, now);
  });
  return "done";
}

// ─── The nightly sync ────────────────────────────────────────────────

async function gapTask(db: Pick<PrismaClient, "provisioningTask">, organisationId: string, title: string, steps: string[], now: Date) {
  if (await db.provisioningTask.findFirst({ where: { organisationId, kind: RECONCILE_KIND, title, status: { in: ["OPEN", "IN_PROGRESS"] } } })) return false;
  await db.provisioningTask.create({
    data: { organisationId, family: "PRODUCTIVITY", kind: RECONCILE_KIND, title, instructions: ["Found by the nightly partner sync.", "", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"), expectedBy: new Date(now.getTime() + 24 * 3_600_000) },
  });
  return true;
}

const CONSENT: Record<"none" | "pending" | "granted", TenantConsent> = { none: "NONE", pending: "REQUESTED", granted: "GRANTED" };

/**
 * Every night, for each tenant whose automation is on: licence counts and
 * people against the partner (each difference a task, once), the
 * customer's admin access, and the security settings when we have it.
 */
export async function syncLicensing(db: PrismaClient, deps: { build?: Build; now?: Date } = {}) {
  const now = deps.now ?? new Date();
  const vendors = new Map<TenantVendor, LicensingVendor | null>();
  for (const v of ["MICROSOFT", "GOOGLE"] as const) vendors.set(v, await automationFor(db, v, deps.build));
  const tenants = await db.tenant.findMany({
    where: { organisation: { deletedAt: null }, vendor: { in: [...vendors].filter(([, a]) => a).map(([v]) => v) } },
    include: { organisation: { select: { name: true } }, licences: true, users: { include: { assignments: { include: { licence: { select: { sku: true } } } } } } },
  });
  let synced = 0;
  let tasks = 0;
  let failed = 0;
  for (const t of tenants) {
    const vendor = vendors.get(t.vendor)!;
    const ref = tenantRef(t);
    const where = `${VENDOR_LABEL[t.vendor]} ${t.primaryDomain}`;
    try {
      const subs = await vendor.subscriptions(ref);
      if (subs) {
        for (const l of t.licences) {
          const theirs = subs.find((s) => s.sku === l.sku)?.quantity ?? 0;
          await db.tenantLicence.update({ where: { id: l.id }, data: { vendorQuantity: theirs, vendorCheckedAt: now } });
          if (theirs !== l.purchased && (await gapTask(db, t.organisationId, `${l.name}: partner has ${theirs}, console records ${l.purchased} (${t.organisation.name})`, [`Check ${l.name} in ${where} with the partner.`, theirs > l.purchased ? "If the partner is right, raise the customer's count in billing, or reduce it with the partner so we don't pay for licences we don't bill." : "If the partner is right, buy the rest: the customer pays for them.", "Correct the count at the customer's Users and licences page, then mark this done."], now))) tasks++;
        }
        for (const s of subs.filter((s) => s.quantity > 0 && !t.licences.some((l) => l.sku === s.sku))) {
          if (await gapTask(db, t.organisationId, `${s.name}: partner has ${s.quantity}, not recorded in the console (${t.organisation.name})`, [`The partner shows ${s.quantity} ${s.name} (${s.sku}) in ${where}, which the console doesn't know.`, "Record it at the customer's Users and licences page and check it is billed, then mark this done."], now)) tasks++;
        }
      }
      const users = await vendor.users(ref);
      if (users) {
        const theirs = new Map(users.filter((u) => u.enabled).map((u) => [u.email, u]));
        const ours = t.users.filter((u) => u.enabled);
        const differences: string[] = [];
        for (const u of ours) {
          const match = theirs.get(u.email.toLowerCase());
          if (!match) differences.push(`${u.email} is in the console but not with the partner.`);
          else {
            const mine = u.assignments.map((a) => a.licence.sku).sort().join(", ");
            const partner = [...match.skus].sort().join(", ");
            if (mine !== partner) differences.push(`${u.email} holds ${mine || "no licence"} in the console but ${partner || "no licence"} with the partner.`);
            if (match.lastSignInAt) await db.tenantUser.update({ where: { id: u.id }, data: { lastSignInAt: match.lastSignInAt } });
          }
        }
        for (const email of theirs.keys()) if (!ours.some((u) => u.email.toLowerCase() === email)) differences.push(`${email} is with the partner but not in the console.`);
        if (differences.length && (await gapTask(db, t.organisationId, `People differ in ${where} (${t.organisation.name})`, [...differences.slice(0, 25), ...(differences.length > 25 ? [`And ${differences.length - 25} more.`] : []), "Correct the console's copy at the customer's Users and licences page, or the tenant if the console is right, then mark this done."], now))) tasks++;
      }
      const consent = await vendor.consent(ref, t.primaryDomain);
      let access = t.consent;
      if (consent) {
        access = consent.status === "none" && t.consent === "REQUESTED" ? "REQUESTED" : CONSENT[consent.status];
        await db.tenant.update({ where: { id: t.id }, data: { consent: access, ...(consent.link ? { consentLink: consent.link } : {}), ...(access === "GRANTED" && t.consent !== "GRANTED" ? { consentGrantedAt: now } : {}) } });
      }
      if (access === "GRANTED") {
        const checks = await vendor.security(ref);
        if (checks) await db.tenant.update({ where: { id: t.id }, data: { securityChecks: checks as object[], securityCheckedAt: now } });
      }
      await db.tenant.update({ where: { id: t.id }, data: { lastSyncedAt: now } });
      synced++;
    } catch (e) {
      if (!(e instanceof LicensingVendorError)) throw e;
      failed++;
    }
  }
  return { synced, tasks, failed };
}

// ─── Admin access (delegated admin, reseller access) ─────────────────

/**
 * A customer's Owner or Admin asks for the link that gives us admin access
 * to their tenant. From the partner's API when it gives one, else from the
 * link set in Partners; with neither, our team sends it.
 */
export async function requestConsent(db: TenantDb, deps: { root: PrismaClient; organisationId: string; organisationName: string; actor: Actor; build?: Build; now?: Date }, tenantId: string) {
  assertCan(deps.actor, "manageLicences");
  const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
  if (!tenant) throw new DomainError("not-found", "No such tenant.");
  if (tenant.consent === "GRANTED") throw new DomainError("conflict", "We already have access.");
  if (!(await automationOn(deps.root, tenant.vendor))) throw new DomainError("conflict", "This isn't available yet.");
  const now = deps.now ?? new Date();
  let link: string | null = null;
  const vendor = await automationFor(deps.root, tenant.vendor, deps.build);
  if (vendor) {
    try {
      link = (await vendor.consent(tenantRef(tenant), tenant.primaryDomain))?.link ?? null;
    } catch (e) {
      if (!(e instanceof LicensingVendorError)) throw e;
    }
  }
  if (!link) {
    const template = (await partnerConfig(deps.root, PARTNER_OF[tenant.vendor]))?.settings.consentLink;
    if (template) link = template.replaceAll("{domain}", encodeURIComponent(tenant.primaryDomain));
  }
  await db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: { consent: "REQUESTED", consentLink: link, consentRequestedAt: now } });
    if (!link)
      await tx.provisioningTask.create({
        data: {
          organisationId: deps.organisationId,
          family: "PRODUCTIVITY",
          kind: "licence_consent",
          title: `Send the admin access invitation for ${tenant.primaryDomain} (${deps.organisationName})`,
          instructions: [`${deps.actor.name} asked to give us admin access to ${VENDOR_LABEL[tenant.vendor]} ${tenant.primaryDomain}.`, "", `1. Create the invitation in the partner portal (${partnerLabel(tenant.vendor)}).`, "2. Email it to them.", "3. Once they accept, mark access as given on the customer's Users and licences page in admin."].join("\n"),
          expectedBy: new Date(now.getTime() + 24 * 3_600_000),
        },
      });
    await audit(tx, customerAudit(deps.actor, deps.organisationId, { action: "tenant.consent_requested", summary: `Asked to give us admin access to ${VENDOR_LABEL[tenant.vendor]} ${tenant.primaryDomain}`, targetType: "Tenant", targetId: tenant.id }));
  });
  return { link };
}

/** Staff record that the customer gave, or withdrew, admin access (manual mode, or to correct it). */
export async function setConsent(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, organisationId: string, tenantId: string, granted: boolean) {
  assertStaffCan(deps.staff, "workTasks");
  const tenant = await deps.db.tenant.findFirst({ where: { id: tenantId, organisationId } });
  if (!tenant) throw new DomainError("not-found", "No such tenant for this customer.");
  const now = deps.now ?? new Date();
  await deps.db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: granted ? { consent: "GRANTED", consentGrantedAt: now } : { consent: "NONE", consentGrantedAt: null, securityChecks: Prisma.DbNull, securityCheckedAt: null } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: granted ? "tenant.consent_granted" : "tenant.consent_removed", summary: granted ? `Recorded that you gave us admin access to ${tenant.primaryDomain}` : `Recorded that we no longer have admin access to ${tenant.primaryDomain}`, targetType: "Tenant", targetId: tenant.id }));
  });
}

/** Staff enter the tenant's security settings by hand (manual mode), one "title=yes|no" per line. */
export function parseChecks(text: string): VendorCheck[] | string {
  const checks: VendorCheck[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(.{3,200})=\s*(yes|no|on|off|true|false)$/i.exec(line);
    if (!m) return `Write each setting as "name=yes" or "name=no": ${line.slice(0, 60)}`;
    const title = m[1].trim();
    checks.push({ key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60), title, ok: /^(yes|on|true)$/i.test(m[2]) });
  }
  return checks.length > 40 ? "Forty settings at most." : checks;
}

export async function saveSecurityChecks(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, organisationId: string, tenantId: string, text: string) {
  assertStaffCan(deps.staff, "workTasks");
  const tenant = await deps.db.tenant.findFirst({ where: { id: tenantId, organisationId } });
  if (!tenant) throw new DomainError("not-found", "No such tenant for this customer.");
  if (tenant.consent !== "GRANTED") throw new DomainError("conflict", "Record that the customer gave us admin access first.");
  const checks = parseChecks(text);
  if (typeof checks === "string") throw new DomainError("invalid", checks, "checks");
  await deps.db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: { securityChecks: checks as object[], securityCheckedAt: deps.now ?? new Date() } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "tenant.security_checked", summary: `Checked the security settings of ${tenant.primaryDomain}: ${checks.filter((c) => !c.ok).length} of ${checks.length} need changing`, targetType: "Tenant", targetId: tenant.id }));
  });
}

/** For the security score: settings across the tenants we have access to, and whether any tenant still needs access. */
export function workspaceFacts(tenants: { consent: TenantConsent; securityChecks: unknown }[]) {
  const checked = tenants.filter((t) => t.consent === "GRANTED" && Array.isArray(t.securityChecks) && t.securityChecks.length);
  const checks = checked.flatMap((t) => t.securityChecks as VendorCheck[]);
  return {
    workspace: checked.length ? { failing: checks.filter((c) => !c.ok).map((c) => c.title), total: checks.length } : null,
    workspaceNeedsAccess: tenants.some((t) => t.consent !== "GRANTED"),
  };
}
