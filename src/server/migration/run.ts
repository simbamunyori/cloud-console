import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { parseDateOnly, todayIn } from "@/lib/dates";
import { money } from "@/lib/domain/money";
import { type BillingAdapter, BillingError } from "@/server/billing/adapter";
import { ensureBillingAccount } from "@/server/billing/accounts";
import { legacyProduct } from "@/server/catalogue/legacy";
import { DomainError, ROLE_LABEL } from "@/server/org/access";
import { audit } from "@/server/org/audit";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { type OdooFile, readOdooExports, type OdooSource } from "./odoo";
import { type PlanReport, planMigration, type ProductMapping, reportHash } from "./plan";

/**
 * The Odoo migration from upload to import. An admin uploads the exports
 * and gets the dry-run report; they choose products where the name match
 * is wrong and approve; a background job then writes everything through
 * the billing adapter. Each row is recorded as it is made (MigrationRecord),
 * so a stopped run carries on where it was and nothing is made twice.
 * Welcome emails are separate (welcome.ts) and wait for the cutover date.
 */

export interface MigrationDeps {
  db: PrismaClient;
  staff: StaffActor;
  now?: Date;
}

const today = (now?: Date) => todayIn(DEFAULT_TIME_ZONE, now);
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Reads the uploaded files and stores the dry run. An earlier upload still waiting for approval is set aside. */
export async function uploadExports(deps: MigrationDeps, uploads: { file: OdooFile; name: string; text: string }[]) {
  assertStaffCan(deps.staff, "migrateClients");
  if (await deps.db.migrationBatch.count({ where: { status: { in: ["APPROVED", "IMPORTING"] } } })) {
    throw new DomainError("conflict", "An import is running. Upload again once it has finished.");
  }
  const source = readOdooExports(uploads);
  const report = await planMigration(deps.db, source, {}, today(deps.now));
  return deps.db.$transaction(async (tx) => {
    await tx.migrationBatch.updateMany({ where: { status: "REVIEW" }, data: { status: "DISCARDED" } });
    const batch = await tx.migrationBatch.create({
      data: { source: json(source), report: json(report), reportHash: reportHash(report), uploadedById: deps.staff.userId, uploadedByName: staffLabel(deps.staff) },
    });
    await tx.staffAuditEvent.create({
      data: { actorUserId: deps.staff.userId, actorLabel: staffLabel(deps.staff), action: "migration.uploaded", summary: `Uploaded Odoo exports for ${report.counts.customers} customers (dry run)`, data: json({ batchId: batch.id, files: source.files }) },
    });
    return batch;
  });
}

async function replan(db: PrismaClient, batch: { source: Prisma.JsonValue; mapping: Prisma.JsonValue }, now?: Date) {
  return planMigration(db, batch.source as unknown as OdooSource, batch.mapping as ProductMapping, today(now));
}

/** Staff choose the product for an Odoo product name ("legacy" for none); the dry run is worked out again. */
export async function chooseProducts(deps: MigrationDeps, batchId: string, choices: ProductMapping) {
  assertStaffCan(deps.staff, "migrateClients");
  const batch = await deps.db.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "REVIEW") throw new DomainError("conflict", "This upload can't be changed any more.");
  const mapping = { ...(batch.mapping as ProductMapping), ...choices };
  const report = await replan(deps.db, { source: batch.source, mapping }, deps.now);
  return deps.db.migrationBatch.update({ where: { id: batch.id }, data: { mapping: json(mapping), report: json(report), reportHash: reportHash(report) } });
}

/**
 * Approves the dry run the admin is looking at. It is worked out again
 * first: if anything changed since the page was shown (the catalogue, an
 * earlier import), the admin sees the new report instead.
 */
export async function approveImport(deps: MigrationDeps, batchId: string, shownHash: string) {
  assertStaffCan(deps.staff, "migrateClients");
  const batch = await deps.db.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "REVIEW") throw new DomainError("conflict", "This upload isn't waiting for approval.");
  const report = await replan(deps.db, batch, deps.now);
  const hash = reportHash(report);
  if (hash !== shownHash || hash !== batch.reportHash) {
    await deps.db.migrationBatch.update({ where: { id: batch.id }, data: { report: json(report), reportHash: hash } });
    throw new DomainError("conflict", "Something changed since this report was worked out. Check the report again, then approve.");
  }
  if (report.problems.length) throw new DomainError("invalid", "Fix the problems in the files first, then upload them again.");
  if (!report.counts.customers && !report.counts.services && !report.counts.domains && !report.counts.invoices) throw new DomainError("invalid", "There is nothing new to bring over.");
  const now = deps.now ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const claimed = await tx.migrationBatch.updateMany({
      where: { id: batch.id, status: "REVIEW" },
      data: { status: "APPROVED", approvedHash: hash, approvedById: deps.staff.userId, approvedByName: staffLabel(deps.staff), approvedAt: now, error: null },
    });
    if (!claimed.count) throw new DomainError("conflict", "Someone else approved or replaced it first.");
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff.userId,
        actorLabel: staffLabel(deps.staff),
        action: "migration.approved",
        summary: `Approved the Odoo import: ${report.counts.customers} customers, ${report.counts.services} services, ${report.counts.domains} domains, ${report.counts.invoices} unpaid invoices`,
        data: json({ batchId: batch.id, hash }),
      },
    });
  });
}

/**
 * After a stop: rows that were being written when it stopped are
 * cleared (staff have checked billing for half-made items), and the
 * import carries on with what is left.
 */
export async function carryOn(deps: MigrationDeps, batchId: string, clearUnfinished: boolean) {
  assertStaffCan(deps.staff, "migrateClients");
  const batch = await deps.db.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "FAILED") throw new DomainError("conflict", "This import hasn't stopped.");
  const unfinished = await deps.db.migrationRecord.findMany({ where: { batchId, targetId: null } });
  if (unfinished.length && !clearUnfinished) throw new DomainError("conflict", "Check billing for the items that were being written, then clear them and carry on.");
  await deps.db.$transaction(async (tx) => {
    if (unfinished.length) await tx.migrationRecord.deleteMany({ where: { id: { in: unfinished.map((r) => r.id) } } });
    await tx.migrationBatch.update({ where: { id: batch.id }, data: { status: "APPROVED", error: null, approvedById: deps.staff.userId, approvedByName: staffLabel(deps.staff) } });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff.userId,
        actorLabel: staffLabel(deps.staff),
        action: "migration.resumed",
        summary: unfinished.length ? `Cleared ${unfinished.length} half-written ${unfinished.length === 1 ? "item" : "items"} and carried on with the Odoo import` : "Carried on with the Odoo import",
        data: json({ batchId, cleared: unfinished.map((r) => `${r.kind} ${r.sourceRef}`) }),
      },
    });
  });
}

// ─── The import itself (a background job) ──────────────────────────

export interface ImportDeps {
  db: PrismaClient;
  adapter: BillingAdapter;
  /** Gives products the import needs a product in billing: the stub links them, WHMCS runs the price sync. */
  linkProducts: (slugs: string[], staff: StaffActor) => Promise<void>;
  now?: Date;
}

class Unfinished extends Error {}

/** Runs every approved import. Safe to run twice: each batch is claimed first. */
export async function runApprovedImports(deps: ImportDeps) {
  const ids = (await deps.db.migrationBatch.findMany({ where: { status: "APPROVED" }, select: { id: true }, orderBy: { approvedAt: "asc" } })).map((b) => b.id);
  for (const id of ids) {
    const claimed = await deps.db.migrationBatch.updateMany({ where: { id, status: "APPROVED" }, data: { status: "IMPORTING", startedAt: deps.now ?? new Date() } });
    if (!claimed.count) continue;
    try {
      await importBatch(deps, id);
      await deps.db.migrationBatch.update({ where: { id }, data: { status: "IMPORTED", finishedAt: deps.now ?? new Date(), error: null } });
    } catch (e) {
      const message = e instanceof Unfinished || e instanceof BillingError || e instanceof DomainError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
      await deps.db.migrationBatch.update({ where: { id }, data: { status: "FAILED", error: message.slice(0, 2000) } });
    }
  }
  return ids.length;
}

async function importBatch(deps: ImportDeps, batchId: string) {
  const { db, adapter } = deps;
  const batch = await db.migrationBatch.findUniqueOrThrow({ where: { id: batchId } });
  const staff: StaffActor = { userId: batch.approvedById!, name: batch.approvedByName!, staffRole: "ADMIN" };
  const report = await replan(db, batch, deps.now);
  // Worked out again: rows imported since approval are now done. A new problem stops it.
  if (report.problems.length) throw new Unfinished(`Something changed since approval: ${report.problems[0].message} Upload the files again.`);

  if (await db.migrationRecord.count({ where: { targetId: null } })) {
    const rows = await db.migrationRecord.findMany({ where: { targetId: null } });
    throw new Unfinished(`These were being written to billing when the last run stopped: ${rows.map((r) => `${r.kind} ${r.sourceRef}`).join(", ")}. Check billing for each, remove anything half-made there, then clear them and carry on.`);
  }

  // Products: legacy ones are made, then everything needed gets its billing product.
  const needed = new Set<string>();
  for (const choice of report.products) {
    if (choice.legacy) await legacyProduct(db, choice.odooProduct);
    needed.add(choice.slug);
  }
  const unlinked = await db.product.findMany({ where: { slug: { in: [...needed] }, billingProductId: null }, select: { slug: true } });
  if (unlinked.length) await deps.linkProducts(unlinked.map((p) => p.slug), staff);
  const productIds = new Map((await db.product.findMany({ where: { slug: { in: [...needed] } }, select: { slug: true, billingProductId: true } })).map((p) => [p.slug, p.billingProductId]));
  const missing = [...needed].filter((slug) => !productIds.get(slug));
  if (missing.length) throw new Unfinished(`These products have no product in billing yet: ${missing.join(", ")}. Run the price sync, then carry on.`);

  /** One billing write, recorded before and after, so a stop in between is never repeated blindly. */
  async function once(kind: string, sourceRef: string, organisationId: string, write: () => Promise<string>) {
    const existing = await db.migrationRecord.findUnique({ where: { kind_sourceRef: { kind, sourceRef } } });
    if (existing?.targetId) return existing.targetId;
    if (existing) throw new Unfinished(`${kind} ${sourceRef} was being written to billing when a run stopped. Check billing for it, then clear it and carry on.`);
    const record = await db.migrationRecord.create({ data: { batchId, kind, sourceRef, organisationId } });
    const targetId = await write();
    await db.migrationRecord.update({ where: { id: record.id }, data: { targetId } });
    return targetId;
  }

  const markets = await db.market.findMany();
  for (const c of report.customers) {
    let organisationId = c.organisationId;
    if (!organisationId) organisationId = await createOrganisation(db, batchId, staff, c, markets.find((m) => m.code === c.market)!);
    else await addPeople(db, batchId, staff, organisationId, c.people);

    const account = await ensureBillingAccount(db, adapter, organisationId);
    await db.migrationRecord.upsert({ where: { kind_sourceRef: { kind: "client", sourceRef: c.ref } }, create: { batchId, kind: "client", sourceRef: c.ref, organisationId, targetId: account.externalClientId }, update: {} });
    const clientId = account.externalClientId;
    const made = { services: 0, domains: 0, invoices: 0 };

    for (const s of c.services.filter((x) => !x.done)) {
      await once("service", s.ref, organisationId, async () => {
        const recurringPrice = money(BigInt(s.recurringMinor), c.currency);
        const { serviceId } = await adapter.importService(clientId, {
          productId: productIds.get(s.productSlug)!,
          quantity: s.billingQuantity,
          billingCycle: s.cycle,
          recurringPrice,
          registeredOn: parseDateOnly(s.registeredOn)!,
          nextDueOn: parseDateOnly(s.nextDueOn)!,
          domain: s.domain ?? undefined,
          note: `From Odoo ${s.subscription}: ${s.odooProduct}`,
        });
        await db.serviceProfile.create({
          data: {
            billingServiceId: serviceId,
            organisationId: organisationId!,
            legacyRecurringMinor: recurringPrice.amountMinor,
            legacyQuantity: s.billingQuantity,
            legacyCurrency: c.currency,
            legacyReviewOn: s.reviewOn ? parseDateOnly(s.reviewOn) : null,
            hostedAt: s.hostedAt,
            hostServer: s.hostServer,
            hostNotes: s.hostNotes,
            lastStatus: "active",
            source: `Odoo ${s.subscription}`,
          },
        });
        made.services++;
        return serviceId;
      });
    }

    for (const d of c.domains.filter((x) => !x.done)) {
      await once("domain", d.ref, organisationId, async () => {
        const { domainId } = await adapter.importDomain(clientId, {
          name: d.name,
          registrar: d.registrar,
          registeredOn: parseDateOnly(d.registeredOn)!,
          expiresOn: parseDateOnly(d.expiresOn)!,
          nextDueOn: parseDateOnly(d.expiresOn)!,
          renewal: money(BigInt(d.renewalMinor), c.currency),
          registrationYears: d.years,
          autoRenew: d.autoRenew,
        });
        made.domains++;
        return domainId;
      });
    }

    for (const i of c.invoices.filter((x) => !x.done)) {
      await once("invoice", i.ref, organisationId, async () => {
        // Tax was on the Odoo invoice already, so the balance is carried untaxed.
        const { invoiceId } = await adapter.createInvoice(clientId, {
          lines: [{ description: i.description, amount: money(BigInt(i.amountMinor), c.currency), taxed: false }],
          paymentMethod: "banktransfer",
          dueOn: parseDateOnly(i.dueOn)!,
          issuedOn: parseDateOnly(i.issuedOn)!,
        });
        made.invoices++;
        return invoiceId;
      });
    }

    const parts = [
      made.services ? `${made.services} ${made.services === 1 ? "service" : "services"}` : "",
      made.domains ? `${made.domains} ${made.domains === 1 ? "domain" : "domains"}` : "",
      made.invoices ? `${made.invoices} unpaid ${made.invoices === 1 ? "invoice" : "invoices"}` : "",
    ].filter(Boolean);
    if (parts.length) {
      await audit(db, staffAudit(staff, organisationId, { action: "migration.imported", summary: `Brought over from our previous billing system: ${parts.join(", ")}, at the same prices and due dates` }));
    }
  }
}

function slugFor(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "organisation"
  );
}

type Market = Prisma.MarketGetPayload<object>;

/** The organisation, its people and the record of both, in one transaction. */
async function createOrganisation(db: PrismaClient, batchId: string, staff: StaffActor, c: PlanReport["customers"][number], market: Market) {
  return db.$transaction(async (tx) => {
    const base = slugFor(c.name);
    const slug = (await tx.organisation.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${randomBytes(3).toString("hex")}` : base;
    const org = await tx.organisation.create({
      data: {
        name: c.name,
        slug,
        country: c.country,
        billingMarket: market.code,
        currency: market.currency,
        timeZone: market.timeZone,
        locale: market.locale,
        billingEmail: c.billingEmail,
        phone: c.phone,
        addressLine1: c.addressLine1,
        addressLine2: c.addressLine2,
        city: c.city,
        postcode: c.postcode,
        vatNumber: c.vatNumber,
        registrationNumber: c.registrationNumber,
      },
    });
    await tx.migrationRecord.create({ data: { batchId, kind: "customer", sourceRef: c.ref, organisationId: org.id, targetId: org.id } });
    await audit(tx, staffAudit(staff, org.id, { action: "organisation.migrated", summary: `Opened the account for ${c.name}, brought over from our previous billing system`, targetType: "Organisation", targetId: org.id }));
    await addPeople(tx, batchId, staff, org.id, c.people);
    return org.id;
  });
}

/** Each person gets a sign-in (with no password until they choose one) and their role. Nobody is emailed yet. */
async function addPeople(tx: Prisma.TransactionClient | PrismaClient, batchId: string, staff: StaffActor, organisationId: string, people: PlanReport["customers"][number]["people"]) {
  for (const p of people) {
    if (await tx.migrationRecord.findUnique({ where: { kind_sourceRef: { kind: "person", sourceRef: p.ref } } })) continue;
    const user = (await tx.user.findUnique({ where: { email: p.email } })) ?? (await tx.user.create({ data: { email: p.email, name: p.name, passwordHash: "", kind: "CUSTOMER" } }));
    if (user.kind !== "CUSTOMER") throw new Unfinished(`${p.email} is a staff sign-in and can't join a customer's account.`);
    await tx.membership.upsert({ where: { organisationId_userId: { organisationId, userId: user.id } }, create: { organisationId, userId: user.id, role: p.role }, update: {} });
    await tx.migrationRecord.create({ data: { batchId, kind: "person", sourceRef: p.ref, organisationId, targetId: user.id } });
    await audit(tx, staffAudit(staff, organisationId, { action: "member.migrated", summary: `Added ${p.email} as ${ROLE_LABEL[p.role]}`, targetType: "User", targetId: user.id }));
  }
}
