import { promises as dnsPromises } from "node:dns";
import type { OnboardingKind, Prisma, PrismaClient, TenantOnboarding, TenantVendor } from "@prisma/client";
import type { TenantDb } from "@/server/db";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { VENDOR_LABEL } from "./provider";

/**
 * Getting a tenant ready. The customer adds DNS records (checked on
 * demand), books the day their email moves, and, when an existing
 * subscription is coming across from another provider, works through a
 * short checklist with us. Staff finish the setup when it's done.
 */

// ─── DNS records ─────────────────────────────────────────────────────

export interface DnsRecord {
  key: string;
  type: "TXT" | "MX" | "CNAME";
  /** "@" for the domain itself. */
  host: string;
  value: string;
  priority?: number;
  /** "now" records prove the domain; "moving-day" ones move the email and wait for the booked day. */
  when: "now" | "moving-day";
  purpose: string;
}

/** What the customer adds for the vendor, in the order they add it. */
export function dnsRecords(vendor: TenantVendor, domain: string, verificationValue: string | null): DnsRecord[] {
  const verify: DnsRecord[] = verificationValue ? [{ key: "verify", type: "TXT", host: "@", value: verificationValue, when: "now", purpose: "Proves the domain is yours" }] : [];
  if (vendor === "MICROSOFT") {
    return [
      ...verify,
      { key: "mx", type: "MX", host: "@", value: `${domain.replace(/\./g, "-")}.mail.protection.outlook.com`, priority: 0, when: "moving-day", purpose: "Sends your email to Microsoft 365" },
      { key: "spf", type: "TXT", host: "@", value: "v=spf1 include:spf.protection.outlook.com -all", when: "moving-day", purpose: "Stops others sending email as you" },
      { key: "autodiscover", type: "CNAME", host: "autodiscover", value: "autodiscover.outlook.com", when: "moving-day", purpose: "Sets up Outlook on its own" },
    ];
  }
  return [
    ...verify,
    { key: "mx", type: "MX", host: "@", value: "smtp.google.com", priority: 1, when: "moving-day", purpose: "Sends your email to Google" },
    { key: "spf", type: "TXT", host: "@", value: "v=spf1 include:_spf.google.com ~all", when: "moving-day", purpose: "Stops others sending email as you" },
  ];
}

export interface DnsResolver {
  resolveTxt(host: string): Promise<string[][]>;
  resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>;
  resolveCname(host: string): Promise<string[]>;
}

const DNS_TIMEOUT_MS = 5000;

/** The system resolver, with a time limit per lookup. */
export const systemResolver: DnsResolver = (() => {
  const r = new dnsPromises.Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  return { resolveTxt: (h) => r.resolveTxt(h), resolveMx: (h) => r.resolveMx(h), resolveCname: (h) => r.resolveCname(h) };
})();

const norm = (v: string) => v.trim().replace(/\.$/, "").toLowerCase();

/** Whether each record is in DNS now. A failed lookup counts as not found. */
export async function lookUp(resolver: DnsResolver, domain: string, records: DnsRecord[]): Promise<Record<string, boolean>> {
  const found: Record<string, boolean> = {};
  await Promise.all(
    records.map(async (r) => {
      const host = r.host === "@" ? domain : `${r.host}.${domain}`;
      try {
        if (r.type === "TXT") found[r.key] = (await resolver.resolveTxt(host)).some((parts) => norm(parts.join("")) === norm(r.value));
        else if (r.type === "MX") found[r.key] = (await resolver.resolveMx(host)).some((mx) => norm(mx.exchange) === norm(r.value));
        else found[r.key] = (await resolver.resolveCname(host)).some((c) => norm(c) === norm(r.value));
      } catch {
        found[r.key] = false;
      }
    }),
  );
  return found;
}

// ─── The transfer checklist ──────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  who: "customer" | "staff";
  title: string;
  detail: string;
}

export const TRANSFER_CHECKLIST: ChecklistItem[] = [
  { key: "accept-invite", who: "customer", title: "Accept us as your partner", detail: "Open the invitation link as an admin of your subscription and accept it. It gives us the access we need, and nothing more." },
  { key: "tell-provider", who: "customer", title: "Tell your current provider you're moving", detail: "Ask them not to renew. Your people, email and files stay as they are." },
  { key: "licences-confirmed", who: "staff", title: "We check your licences and people", detail: "We match what you have today, so nothing is lost on the day billing moves." },
  { key: "billing-switched", who: "staff", title: "Your subscription is billed by us", detail: "From your renewal date it's on your monthly invoice from us." },
];

type Checklist = Record<string, { at: string; by: string }>;
const checklistOf = (o: Pick<TenantOnboarding, "checklist">): Checklist => (o.checklist && typeof o.checklist === "object" && !Array.isArray(o.checklist) ? (o.checklist as Checklist) : {});

// ─── Reading ─────────────────────────────────────────────────────────

export interface OnboardingView {
  id: string;
  tenantId: string;
  kind: OnboardingKind;
  vendorLabel: string;
  domain: string;
  records: (DnsRecord & { found: boolean | null })[];
  dnsCheckedAt: Date | null;
  domainVerifiedAt: Date | null;
  migration: { source: string; startsAt: Date; notes: string | null } | null;
  partnerInviteUrl: string | null;
  checklist: (ChecklistItem & { doneAt: Date | null; doneBy: string | null })[];
  completedAt: Date | null;
}

type ReadDb = Pick<TenantDb, "tenantOnboarding"> | Pick<PrismaClient, "tenantOnboarding">;

export async function onboardings(db: ReadDb, organisationId?: string): Promise<OnboardingView[]> {
  const rows = await (db.tenantOnboarding as PrismaClient["tenantOnboarding"]).findMany({ where: organisationId ? { organisationId } : {}, include: { tenant: true }, orderBy: { createdAt: "asc" } });
  return rows.map((o) => {
    const results = (o.dnsResults ?? {}) as Record<string, boolean>;
    const done = checklistOf(o);
    return {
      id: o.id,
      tenantId: o.tenantId,
      kind: o.kind,
      vendorLabel: VENDOR_LABEL[o.tenant.vendor],
      domain: o.tenant.primaryDomain,
      records: dnsRecords(o.tenant.vendor, o.tenant.primaryDomain, o.verificationValue).map((r) => ({ ...r, found: o.dnsCheckedAt ? Boolean(results[r.key]) : null })),
      dnsCheckedAt: o.dnsCheckedAt,
      domainVerifiedAt: o.domainVerifiedAt,
      migration: o.migrationStartsAt && o.migrationSource ? { source: o.migrationSource, startsAt: o.migrationStartsAt, notes: o.migrationNotes } : null,
      partnerInviteUrl: o.partnerInviteUrl,
      checklist: o.kind === "TRANSFER" ? TRANSFER_CHECKLIST.map((i) => ({ ...i, doneAt: done[i.key] ? new Date(done[i.key].at) : null, doneBy: done[i.key]?.by ?? null })) : [],
      completedAt: o.completedAt,
    };
  });
}

// ─── Customer steps ──────────────────────────────────────────────────

type Ctx = { organisationId: string; organisationName: string; actor: Actor; now?: Date };

async function openOnboarding(db: TenantDb, id: string) {
  const o = await db.tenantOnboarding.findFirst({ where: { id }, include: { tenant: true } });
  if (!o) throw new DomainError("not-found", "No such setup.");
  if (o.completedAt) throw new DomainError("conflict", "This setup is already finished.");
  return o;
}

/** Looks the records up now. The first time the verification record is found, the domain counts as proven. */
export async function checkDns(db: TenantDb, ctx: Ctx, onboardingId: string, resolver: DnsResolver = systemResolver) {
  assertCan(ctx.actor, "manageLicences");
  const o = await openOnboarding(db, onboardingId);
  const records = dnsRecords(o.tenant.vendor, o.tenant.primaryDomain, o.verificationValue);
  const found = await lookUp(resolver, o.tenant.primaryDomain, records);
  const now = ctx.now ?? new Date();
  const newlyVerified = !o.domainVerifiedAt && Boolean(o.verificationValue) && found.verify;
  return db.$transaction(async (tx) => {
    const updated = await tx.tenantOnboarding.update({ where: { id: o.id }, data: { dnsCheckedAt: now, dnsResults: found, ...(newlyVerified ? { domainVerifiedAt: now } : {}) } });
    if (newlyVerified) await audit(tx, customerAudit(ctx.actor, ctx.organisationId, { action: "tenant.domain_verified", summary: `Proved ${o.tenant.primaryDomain} for ${VENDOR_LABEL[o.tenant.vendor]}`, targetType: "Tenant", targetId: o.tenantId }));
    return { onboarding: updated, found, records };
  });
}

export const MIGRATION_SOURCES = ["Microsoft 365 with another provider", "Google Workspace", "Our web host or cPanel", "Another email service", "No email yet"] as const;

/** The earliest a move can start: two working days out, so we can prepare. */
export function earliestMove(now: Date): Date {
  const d = new Date(now);
  let days = 0;
  while (days < 2) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days++;
  }
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Books the email move for a date and start time (in the organisation's
 * time zone, given as an instant). Rebooking replaces the date and puts
 * the new one on the same staff task.
 */
export async function bookMigration(db: TenantDb, ctx: Ctx, onboardingId: string, input: { startsAt: Date | null; source: string; notes?: string }) {
  assertCan(ctx.actor, "manageLicences");
  const o = await openOnboarding(db, onboardingId);
  const now = ctx.now ?? new Date();
  const errors: Record<string, string> = {};
  if (!input.startsAt || Number.isNaN(input.startsAt.getTime())) errors.startsAt = "Choose a day and time.";
  else if (input.startsAt < earliestMove(now)) errors.startsAt = "Choose a day at least two working days from now, so we can prepare.";
  else if (input.startsAt.getTime() > now.getTime() + 180 * 86_400_000) errors.startsAt = "Choose a day within the next six months.";
  if (!(MIGRATION_SOURCES as readonly string[]).includes(input.source)) errors.source = "Choose where your email is now.";
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
  const notes = input.notes?.trim().slice(0, 1000) || null;
  const startsAt = input.startsAt!;
  const when = startsAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const steps = [
    `Move email for ${o.tenant.primaryDomain} from "${input.source}" into ${VENDOR_LABEL[o.tenant.vendor]}, starting ${when}.`,
    ...(notes ? [`The customer says: ${notes}`] : []),
    "",
    "1. Two days before: check every person has a mailbox and licence, and start copying mail in the background.",
    "2. On the day: switch the MX, SPF and autodiscover records (or ask the customer to), then copy the last mail across.",
    "3. Check a test email both ways, tell the customer, and mark this done.",
  ];

  return db.$transaction(async (tx) => {
    let taskId = o.migrationTaskId;
    const task = taskId ? await tx.provisioningTask.findFirst({ where: { id: taskId, status: { in: ["OPEN", "IN_PROGRESS"] } } }) : null;
    if (task) {
      await tx.provisioningTask.update({ where: { id: task.id }, data: { instructions: steps.join("\n"), expectedBy: startsAt } });
    } else {
      taskId = (
        await tx.provisioningTask.create({
          data: { organisationId: ctx.organisationId, family: "PRODUCTIVITY", kind: "email_migration", title: `Move email for ${o.tenant.primaryDomain} (${ctx.organisationName})`, instructions: steps.join("\n"), expectedBy: startsAt },
        })
      ).id;
    }
    const updated = await tx.tenantOnboarding.update({ where: { id: o.id }, data: { migrationSource: input.source, migrationStartsAt: startsAt, migrationNotes: notes, migrationTaskId: taskId } });
    await audit(tx, customerAudit(ctx.actor, ctx.organisationId, { action: o.migrationStartsAt ? "tenant.migration_rebooked" : "tenant.migration_booked", summary: `Booked the email move for ${o.tenant.primaryDomain}, starting ${when}`, targetType: "Tenant", targetId: o.tenantId }));
    return updated;
  });
}

async function tick(tx: Pick<Prisma.TransactionClient, "tenantOnboarding">, o: TenantOnboarding, key: string, by: string, done: boolean, now: Date) {
  const list = { ...checklistOf(o) };
  if (done) list[key] = { at: now.toISOString(), by };
  else delete list[key];
  return tx.tenantOnboarding.update({ where: { id: o.id }, data: { checklist: list } });
}

/** The customer ticks (or unticks) one of their own checklist items. */
export async function tickCustomerItem(db: TenantDb, ctx: Ctx, onboardingId: string, key: string, done: boolean) {
  assertCan(ctx.actor, "manageLicences");
  const o = await openOnboarding(db, onboardingId);
  const item = TRANSFER_CHECKLIST.find((i) => i.key === key);
  if (o.kind !== "TRANSFER" || !item || item.who !== "customer") throw new DomainError("invalid", "That isn't one of your steps.");
  return db.$transaction(async (tx) => {
    const updated = await tick(tx as unknown as Prisma.TransactionClient, o, key, ctx.actor.name, done, ctx.now ?? new Date());
    await audit(tx, customerAudit(ctx.actor, ctx.organisationId, { action: "tenant.checklist", summary: `${done ? "Ticked" : "Unticked"} "${item.title}"`, targetType: "Tenant", targetId: o.tenantId }));
    return updated;
  });
}

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * A customer asks us to bring their existing subscription across. The
 * tenant and its setup are created at once; staff get a task to send the
 * partner invitation and record what's there.
 */
export async function requestTransfer(db: TenantDb, ctx: Ctx, input: { vendor: string; domain: string; people: string }) {
  assertCan(ctx.actor, "manageLicences");
  const vendor = input.vendor as TenantVendor;
  const domain = input.domain.trim().toLowerCase();
  const people = Number(input.people.trim());
  const errors: Record<string, string> = {};
  if (vendor !== "MICROSOFT" && vendor !== "GOOGLE") errors.vendor = "Choose Microsoft 365 or Google Workspace.";
  if (!DOMAIN.test(domain)) errors.domain = "Enter the domain your people sign in with, like kgalehill.co.bw.";
  if (!Number.isInteger(people) || people < 1 || people > 10_000) errors.people = "Enter about how many people use it.";
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
  const now = ctx.now ?? new Date();
  return db.$transaction(async (tx) => {
    if (await tx.tenant.findFirst({ where: { vendor } })) throw new DomainError("conflict", `Your ${VENDOR_LABEL[vendor]} is already linked.`, "vendor");
    const tenant = await tx.tenant.create({ data: { organisationId: ctx.organisationId, vendor, primaryDomain: domain } });
    const onboarding = await tx.tenantOnboarding.create({ data: { organisationId: ctx.organisationId, tenantId: tenant.id, kind: "TRANSFER" } });
    await tx.provisioningTask.create({
      data: {
        organisationId: ctx.organisationId,
        family: "PRODUCTIVITY",
        kind: "tenant_transfer",
        title: `Bring ${VENDOR_LABEL[vendor]} for ${domain} across (${ctx.organisationName})`,
        instructions: [
          `${ctx.actor.name} asked to move their existing ${VENDOR_LABEL[vendor]} (${domain}, about ${people} people) to us.`,
          "",
          "1. Create the partner invitation in the partner portal and paste its link into the setup at the customer's Users and licences page.",
          "2. Once they accept, record their licences and people there, and tick \"We check your licences and people\".",
          "3. Add the matching service to their account from their renewal date, and tick \"Your subscription is billed by us\".",
          "4. Finish the setup and mark this done.",
        ].join("\n"),
        expectedBy: new Date(now.getTime() + 24 * 3_600_000),
      },
    });
    await audit(tx, customerAudit(ctx.actor, ctx.organisationId, { action: "tenant.transfer_requested", summary: `Asked to bring ${VENDOR_LABEL[vendor]} for ${domain} across`, targetType: "Tenant", targetId: tenant.id }));
    return { tenant, onboarding };
  });
}

// ─── Staff steps ─────────────────────────────────────────────────────

export interface StaffOnboardingDeps {
  db: PrismaClient;
  staff: StaffActor;
  now?: Date;
}

async function staffOnboarding(db: Pick<Prisma.TransactionClient, "tenantOnboarding">, organisationId: string, id: string) {
  const o = await db.tenantOnboarding.findFirst({ where: { id, organisationId }, include: { tenant: true } });
  if (!o) throw new DomainError("not-found", "No such setup for this customer.");
  return o;
}

/** Starts the setup of a tenant staff linked, or updates its verification value and invitation link. */
export async function saveOnboarding(deps: StaffOnboardingDeps, organisationId: string, input: { tenantId: string; kind: string; verificationValue?: string; partnerInviteUrl?: string }) {
  assertStaffCan(deps.staff, "workTasks");
  const kind = input.kind as OnboardingKind;
  if (kind !== "NEW" && kind !== "TRANSFER") throw new DomainError("invalid", "Choose a new setup or a transfer.", "kind");
  const verificationValue = input.verificationValue?.trim() || null;
  if (verificationValue && !/^[\x21-\x7e]{6,255}$/.test(verificationValue)) throw new DomainError("invalid", "Paste the verification value exactly as the portal shows it, like MS=ms48213377.", "verificationValue");
  const invite = input.partnerInviteUrl?.trim() || null;
  if (invite && !/^https:\/\/[^\s]+$/.test(invite)) throw new DomainError("invalid", "Paste the full https link from the partner portal.", "partnerInviteUrl");
  return deps.db.$transaction(async (tx) => {
    const tenant = await tx.tenant.findFirst({ where: { id: input.tenantId, organisationId } });
    if (!tenant) throw new DomainError("not-found", "No such tenant for this customer.");
    const existing = await tx.tenantOnboarding.findUnique({ where: { tenantId: tenant.id } });
    if (existing?.completedAt) throw new DomainError("conflict", "This setup is already finished.");
    const data = { kind, verificationValue, partnerInviteUrl: invite, ...(existing && existing.verificationValue !== verificationValue ? { domainVerifiedAt: null } : {}) };
    const saved = existing ? await tx.tenantOnboarding.update({ where: { id: existing.id }, data }) : await tx.tenantOnboarding.create({ data: { organisationId, tenantId: tenant.id, ...data } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: existing ? "tenant.setup_updated" : "tenant.setup_started", summary: `${existing ? "Updated" : "Started"} the setup of ${VENDOR_LABEL[tenant.vendor]} for ${tenant.primaryDomain}`, targetType: "Tenant", targetId: tenant.id }));
    return saved;
  });
}

export async function tickStaffItem(deps: StaffOnboardingDeps, organisationId: string, onboardingId: string, key: string, done: boolean) {
  assertStaffCan(deps.staff, "workTasks");
  const item = TRANSFER_CHECKLIST.find((i) => i.key === key && i.who === "staff");
  if (!item) throw new DomainError("invalid", "That isn't a staff step.");
  return deps.db.$transaction(async (tx) => {
    const o = await staffOnboarding(tx, organisationId, onboardingId);
    if (o.completedAt) throw new DomainError("conflict", "This setup is already finished.");
    const updated = await tick(tx, o, key, deps.staff.name, done, deps.now ?? new Date());
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "tenant.checklist", summary: `${done ? "Ticked" : "Unticked"} "${item.title}"`, targetType: "Tenant", targetId: o.tenantId }));
    return updated;
  });
}

/** Finishes the setup: the panel leaves the customer's page. */
export async function finishOnboarding(deps: StaffOnboardingDeps, organisationId: string, onboardingId: string) {
  assertStaffCan(deps.staff, "workTasks");
  return deps.db.$transaction(async (tx) => {
    const o = await staffOnboarding(tx, organisationId, onboardingId);
    if (o.completedAt) throw new DomainError("conflict", "This setup is already finished.");
    const now = deps.now ?? new Date();
    const updated = await tx.tenantOnboarding.update({ where: { id: o.id }, data: { completedAt: now } });
    await tx.tenant.update({ where: { id: o.tenantId }, data: { lastSyncedAt: now } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "tenant.setup_finished", summary: `Finished setting up ${VENDOR_LABEL[o.tenant.vendor]} for ${o.tenant.primaryDomain}`, targetType: "Tenant", targetId: o.tenantId }));
    return updated;
  });
}
