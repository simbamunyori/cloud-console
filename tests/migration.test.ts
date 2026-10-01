import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE } from "../src/config/app";
import { addDays, parseDateOnly, todayIn, toDateOnly } from "../src/lib/dates";
import { money } from "../src/lib/domain/money";
import { monthOf } from "../src/lib/domain/pricing";
import { saveFamily } from "../src/server/admin/catalogue";
import { linkStubProduct, seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { scopedBilling } from "../src/server/billing/scoped";
import { planSync } from "../src/server/billing/whmcs/price-sync";
import { LEGACY_CATEGORY, legacySlug } from "../src/server/catalogue/legacy";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { deliverDue } from "../src/server/email/outbox";
import { ODOO_FILES, ODOO_TEMPLATES, readOdooExports, readOdooFile } from "../src/server/migration/odoo";
import { nameScore, planMigration, readCountry, readCycle, readDate, readDecimal } from "../src/server/migration/plan";
import { approveImport, carryOn, chooseProducts, runApprovedImports, uploadExports } from "../src/server/migration/run";
import { hostedWork, moveToOurServers, remindLateTasks, watchHostedElsewhere } from "../src/server/migration/services";
import { sendWelcomes, setCutover } from "../src/server/migration/welcome";
import { previewQuantityChange } from "../src/server/orders/orders";
import { tenantDb } from "../src/server/db";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, uniqueEmail } from "./helpers";

const today = todayIn(DEFAULT_TIME_ZONE);
const day = (n: number) => toDateOnly(addDays(today, n));

describe("reading Odoo exports", () => {
  it("reads dates, amounts, billing periods and countries as Odoo writes them", () => {
    expect(readDate("2026-08-12")).toEqual(parseDateOnly("2026-08-12"));
    expect(readDate("2026-08-12 09:15:00")).toEqual(parseDateOnly("2026-08-12"));
    expect(readDate("12/08/2026")).toEqual(parseDateOnly("2026-08-12"));
    expect(readDate("12 Aug 2026")).toEqual(parseDateOnly("2026-08-12"));
    expect(readDate("31/02/2026")).toBeNull();
    expect(readDecimal("P 1,234.50")).toBe(1_234_500_000n);
    expect(readDecimal("12.3456")).toBe(12_345_600n);
    expect(readDecimal("-15")).toBe(-15_000_000n);
    expect(readDecimal("twelve")).toBeNull();
    expect(["Monthly", "Quarterly", "6 Months", "Yearly", "1 Months", "Annual"].map(readCycle)).toEqual(["monthly", "quarterly", "semiannually", "annually", "monthly", "annually"]);
    expect(readCycle("Weekly")).toBeNull();
    expect([readCountry("base.bw"), readCountry("ZA"), readCountry("Botswana"), readCountry("Narnia")]).toEqual(["BW", "ZA", "BW", null]);
    expect(nameScore("[M365-STD] Microsoft 365 Business Standard", "Microsoft 365 Business Standard")).toBe(1);
    expect(nameScore("Office 365 Standard", "Microsoft 365 Business Standard")).toBeLessThan(0.6);
  });

  it("finds columns by Odoo's labels or technical names, and fills in a subscription's later lines", () => {
    const { rows, problems } = readOdooFile(
      "services",
      "Order Reference,Customer/ID,Recurring Plan,Next Invoice,Order Lines/Product,Order Lines/Quantity,Order Lines/Unit Price\nSUB/1,__export__.a,Monthly,2030-01-01,Web hosting,1,120\n,,,,Business email,5,45\n",
    );
    expect(problems).toEqual([]);
    expect(rows[1]).toMatchObject({ row: 3, subscription: "SUB/1", customerRef: "__export__.a", plan: "Monthly", product: "Business email", quantity: "5" });
    expect(readOdooFile("invoices", "Number,Customer\nINV/1,Acme\n").problems).toEqual(expect.arrayContaining([expect.stringContaining('"Invoice/Bill Date"')]));
    expect(readOdooExports([]).problems.map((p) => p.file)).toEqual(["customers", "services"]);
  });

  it("asks staff for each change to a service hosted elsewhere", () => {
    expect(hostedWork("active", "suspended")).toBe("suspend");
    expect(hostedWork("suspended", "active")).toBe("unsuspend");
    expect(hostedWork("suspended", "cancelled")).toBe("cancel");
    expect(hostedWork("pending", "active")).toBeNull();
    expect(hostedWork("cancelled", "terminated")).toBeNull();
  });
});

describe.skipIf(!hasDb)("bringing clients over from Odoo", () => {
  let admin: StaffActor;
  const stub = () => new StubBillingAdapter(db);
  const linkProducts = async (slugs: string[]) => {
    for (const slug of slugs) await linkStubProduct(db, slug);
  };
  const tag = Math.random().toString(36).slice(2, 8);
  const ref = (s: string) => `__export__.${s}_${tag}`;
  const owner = uniqueEmail("kgosi");
  const accounts = uniqueEmail("accounts");
  const domainName = `kgosi-${tag}.co.bw`;

  const files = () => [
    {
      file: "customers" as const,
      name: "customers.csv",
      text: [
        "ID,Name,Email,Phone,Street,City,Country,Tax ID",
        `${ref("kgosi")},Kgosi Builders ${tag},${owner},+267 71 111 111,Plot 5,Gaborone,Botswana,C0123`,
        `${ref("quiet")},Quiet Client ${tag},quiet-${tag}@example.co.bw,,,,Botswana,`,
      ].join("\n"),
    },
    {
      file: "contacts" as const,
      name: "contacts.csv",
      text: ["ID,Related Company/ID,Name,Email,Address Type", `${ref("lesedi")},${ref("kgosi")},Lesedi Accounts,${accounts},Invoice Address`].join("\n"),
    },
    {
      file: "services" as const,
      name: "subscriptions.csv",
      text: [
        "Order Reference,Customer/ID,Recurring Plan,Next Invoice,Start Date,Currency,Status,Order Lines/Product,Order Lines/Quantity,Order Lines/Unit Price,Order Lines/Discount (%),Hosted at,Server or account,Hosting notes,Price review date",
        `SUB/${tag}/1,${ref("kgosi")},Monthly,${day(20)},2025-03-01,BWP,In Progress,[BAK-M365] Backup for Microsoft 365,6,33.3333,10,,,,${day(200)}`,
        `,,,,,,,[WEB-OLD] Old hosting plan A,1,150,,Contabo,vps-17 (161.97.0.17),cPanel account kgosi,`,
        `SUB/${tag}/2,${ref("kgosi")},Quarterly,${day(45)},,BWP,In Progress,Managed support plan,1,4500,,,,,`,
        `SUB/${tag}/3,${ref("kgosi")},Monthly,${day(5)},,BWP,Closed,Web hosting,1,99,,,,,`,
      ].join("\n"),
    },
    {
      file: "domains" as const,
      name: "domains.csv",
      text: ["Domain,Customer ID,Expires on,Renewal price,Registrar", `${domainName},${ref("kgosi")},${day(90)},310.00,cocca`].join("\n"),
    },
    {
      file: "invoices" as const,
      name: "invoices.csv",
      text: [
        "Number,Customer/ID,Invoice/Bill Date,Due Date,Amount Due,Total,Currency,Type",
        `INV/${tag}/0042,${ref("lesedi")},2026-08-12,2026-09-11,"1,140.00","2,280.00",BWP,Customer Invoice`,
        `INV/${tag}/0043,${ref("kgosi")},2026-08-20,2026-09-19,0.00,500.00,BWP,Customer Invoice`,
      ].join("\n"),
    },
  ];

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [monthOf(new Date())]);
    // An earlier run's leftovers mustn't block this one.
    await db.migrationBatch.updateMany({ where: { status: { in: ["REVIEW", "APPROVED", "IMPORTING", "FAILED"] } }, data: { status: "DISCARDED" } });
    const user = await db.user.create({ data: { email: uniqueEmail("admin"), name: "Neo Admin", passwordHash: "x", kind: "STAFF", staffRole: "ADMIN", totpEnabled: true } });
    admin = { userId: user.id, name: user.name, staffRole: "ADMIN" };
  });

  it("works out the dry run without writing anything", async () => {
    const report = await planMigration(db, readOdooExports(files()), {}, today);
    // Other suites run alongside, so only this test's own names are counted.
    expect(await db.organisation.count({ where: { name: { contains: tag } } })).toBe(0);
    expect(await db.migrationRecord.count({ where: { sourceRef: { contains: tag } } })).toBe(0);
    expect(report.problems).toEqual([]);
    // The quiet client has nothing running or owed, so it stays behind.
    expect(report.customers.map((c) => c.name)).toEqual([`Kgosi Builders ${tag}`]);
    const [c] = report.customers;
    expect(c).toMatchObject({ market: "bw", currency: "BWP", country: "BW", billingEmail: accounts, vatNumber: "C0123" });
    expect(c.people.map((p) => [p.email, p.role])).toEqual([
      [owner, "OWNER"],
      [accounts, "BILLING"],
    ]);
    const [backup, hosting, support] = c.services;
    // 6 x 33.3333 less 10%: 179.99982, so P 180.00.
    expect(backup).toMatchObject({ productSlug: "backup-microsoft-365", legacy: false, quantity: 6, billingQuantity: 6, cycle: "monthly", recurringMinor: "18000", nextDueOn: day(20), registeredOn: "2025-03-01", reviewOn: day(200), hostedAt: "OURS" });
    expect(hosting).toMatchObject({ subscription: `SUB/${tag}/1`, productSlug: legacySlug("[WEB-OLD] Old hosting plan A"), legacy: true, recurringMinor: "15000", hostedAt: "CONTABO", hostServer: "vps-17 (161.97.0.17)", hostNotes: "cPanel account kgosi" });
    expect(support).toMatchObject({ productSlug: "managed-support", cycle: "quarterly", recurringMinor: "450000", nextDueOn: day(45) });
    expect(c.domains).toMatchObject([{ name: domainName, expiresOn: day(90), renewalMinor: "31000", years: 1, autoRenew: true }]);
    // The contact person's invoice belongs to their company; a paid one is skipped.
    expect(c.invoices).toMatchObject([{ number: `INV/${tag}/0042`, amountMinor: "114000", issuedOn: "2026-08-12", dueOn: "2026-09-11", description: `Balance still owed on invoice INV/${tag}/0042 of 12 Aug 2026` }]);
    expect(report.counts).toMatchObject({ customers: 1, people: 2, services: 3, domains: 1, invoices: 1, skipped: 2 });
    expect(report.monthly.BWP).toBe(String(18000 + 15000 + 150000));
    expect(report.openingBalances.BWP).toBe("114000");
    expect(report.earliestDue).toBe(day(20));
  });

  it("refuses rows that would bill early, late or twice", async () => {
    const bad = files().map((f) =>
      f.file === "services"
        ? { ...f, text: f.text + `\nSUB/${tag}/9,${ref("kgosi")},Monthly,${day(0)},,BWP,In Progress,Web hosting,1,99,,,,,\nSUB/${tag}/10,${ref("kgosi")},Weekly,${day(9)},,BWP,In Progress,Web hosting,1,99,,,,,\nSUB/${tag}/11,${ref("kgosi")},Monthly,${day(9)},,ZAR,In Progress,Web hosting,1,99,,,,,\nSUB/${tag}/12,${ref("nobody")},Monthly,${day(9)},,BWP,In Progress,Web hosting,1,99,,,,,` }
        : f,
    );
    const report = await planMigration(db, readOdooExports(bad), {}, today);
    const messages = report.problems.map((p) => p.message).join("\n");
    expect(messages).toContain("isn't after today");
    expect(messages).toContain('"Weekly" isn\'t one billing has');
    expect(messages).toContain("will be billed in BWP");
    expect(messages).toContain("isn't in the customers file");
  });

  it("imports what an admin approved, once, with legacy prices and the old due dates", async () => {
    const batch = await uploadExports({ db, staff: admin }, files());
    const chosen = await chooseProducts({ db, staff: admin }, batch.id, { "Managed support plan": "legacy" });
    const report = chosen.report as unknown as Awaited<ReturnType<typeof planMigration>>;
    expect(report.products.find((p) => p.odooProduct === "Managed support plan")).toMatchObject({ legacy: true, how: "staff" });
    await expect(approveImport({ db, staff: admin }, batch.id, "stale")).rejects.toMatchObject({ code: "conflict" });
    const support = { ...admin, staffRole: "SUPPORT" as const };
    await expect(approveImport({ db, staff: support }, batch.id, chosen.reportHash)).rejects.toMatchObject({ code: "forbidden" });

    await approveImport({ db, staff: admin }, batch.id, chosen.reportHash);
    expect(await runApprovedImports({ db, adapter: stub(), linkProducts })).toBeGreaterThan(0);
    const done = await db.migrationBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(done).toMatchObject({ status: "IMPORTED", error: null });

    const org = await db.organisation.findFirstOrThrow({ where: { name: `Kgosi Builders ${tag}` }, include: { memberships: { include: { user: true } } } });
    expect(org).toMatchObject({ billingMarket: "bw", currency: "BWP", billingEmail: accounts, vatNumber: "C0123" });
    expect(org.memberships.map((m) => [m.user.email, m.role, m.user.passwordHash])).toEqual(
      expect.arrayContaining([
        [owner, "OWNER", ""],
        [accounts, "BILLING", ""],
      ]),
    );
    // Nobody is told anything until the cutover date.
    expect(await db.outboundEmail.count({ where: { toAddress: { in: [owner, accounts] } } })).toBe(0);

    const billing = await scopedBilling(db, stub(), org.id);
    const services = await billing.listServices();
    expect(services.map((s) => [s.name, s.status, s.quantity, s.billingCycle, s.recurring.amountMinor, toDateOnly(s.nextDueOn)]).sort()).toEqual(
      [
        ["Backup for Microsoft 365", "active", 6, "monthly", 18000n, day(20)],
        ["Managed support plan", "active", 1, "quarterly", 450000n, day(45)],
        ["Old hosting plan A", "active", 1, "monthly", 15000n, day(20)],
      ].sort(),
    );
    const legacyProduct = await db.product.findUniqueOrThrow({ where: { slug: legacySlug("Managed support plan") } });
    expect(legacyProduct).toMatchObject({ categoryKey: LEGACY_CATEGORY, status: "DRAFT" });
    expect((await billing.listDomains())[0]).toMatchObject({ name: domainName, status: "active", nextDueOn: parseDateOnly(day(90)) });
    const invoices = await billing.listInvoices();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: "unpaid", issuedOn: parseDateOnly("2026-08-12"), dueOn: parseDateOnly("2026-09-11"), total: money(114000n, "BWP") });
    expect((await billing.getInvoice(invoices[0].invoiceId))?.tax.amountMinor).toBe(0n);
    expect(await db.auditEvent.findFirst({ where: { organisationId: org.id, action: "migration.imported" } })).toMatchObject({ summary: "Brought over from our previous billing system: 3 services, 1 domain, 1 unpaid invoice, at the same prices and due dates" });

    // A second upload of the same files finds nothing new.
    const again = await uploadExports({ db, staff: admin }, files());
    const second = again.report as unknown as Awaited<ReturnType<typeof planMigration>>;
    expect(second.counts).toMatchObject({ customers: 0, services: 0, domains: 0, invoices: 0, done: 5 });
    await expect(approveImport({ db, staff: admin }, again.id, again.reportHash)).rejects.toMatchObject({ code: "invalid" });
  });

  it("prices a change of users from the kept price, whatever the price book says", async () => {
    const org = await db.organisation.findFirstOrThrow({ where: { name: `Kgosi Builders ${tag}` } });
    const ownerUser = await db.user.findUniqueOrThrow({ where: { email: owner }, include: { memberships: true } });
    const billing = await scopedBilling(db, stub(), org.id);
    const backup = (await billing.listServices()).find((s) => s.name === "Backup for Microsoft 365")!;
    const preview = await previewQuantityChange({ db: tenantDb(org.id), billing, organisation: org, actor: { membershipId: ownerUser.memberships[0].id, userId: ownerUser.id, name: ownerUser.name, role: "OWNER" } }, backup.serviceId, "8");
    // P 180.00 for 6 is P 30.00 each: P 240.00 for 8.
    expect(preview.unitPrice).toEqual(money(3000n, "BWP"));
    expect(preview.preview.newRecurring).toEqual(money(24000n, "BWP"));
  });

  it("turns billing changes on a service at Contabo into staff tasks, with reminders", async () => {
    const org = await db.organisation.findFirstOrThrow({ where: { name: `Kgosi Builders ${tag}` } });
    const a = stub();
    const billing = await scopedBilling(db, a, org.id);
    const hosting = (await billing.listServices()).find((s) => s.name === "Old hosting plan A")!;
    await a.runModuleAction(hosting.serviceId, "suspend", "Overdue on payment");
    await watchHostedElsewhere({ db, adapter: a });
    const task = await db.provisioningTask.findFirstOrThrow({ where: { billingServiceId: hosting.serviceId, kind: "hosted_suspend" } });
    expect(task).toMatchObject({ status: "OPEN", title: "Suspend Old hosting plan A at Contabo", family: "SERVICES" });
    expect(task.instructions).toContain("vps-17 (161.97.0.17)");
    expect(task.instructions).toContain("Overdue on payment");
    // Running again makes nothing more.
    expect(await watchHostedElsewhere({ db, adapter: a })).toBe(0);

    // Late: one reminder, then nothing until a day has passed.
    const later = new Date(Date.now() + 5 * 3_600_000);
    expect(await remindLateTasks({ db, now: later })).toBeGreaterThanOrEqual(1);
    expect(await db.provisioningTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ remindedAt: later });
    expect(await db.outboundEmail.findFirst({ where: { kind: "task.reminder", payload: { equals: { taskId: task.id } } } })).not.toBeNull();
    const sent = await db.outboundEmail.count({ where: { kind: "task.reminder", payload: { equals: { taskId: task.id } } } });
    await remindLateTasks({ db, now: new Date(later.getTime() + 3_600_000) });
    expect(await db.outboundEmail.count({ where: { kind: "task.reminder", payload: { equals: { taskId: task.id } } } })).toBe(sent);

    // Paid before anyone got to it: the suspension is called off, not reversed.
    await a.runModuleAction(hosting.serviceId, "unsuspend");
    await watchHostedElsewhere({ db, adapter: a });
    expect(await db.provisioningTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await db.provisioningTask.count({ where: { billingServiceId: hosting.serviceId, kind: "hosted_unsuspend" } })).toBe(0);

    // Once moved to our servers, billing changes need nobody.
    await moveToOurServers({ db, staff: admin }, org.id, hosting);
    await a.runModuleAction(hosting.serviceId, "suspend", "Overdue on payment");
    await watchHostedElsewhere({ db, adapter: a });
    expect(await db.provisioningTask.count({ where: { billingServiceId: hosting.serviceId, status: "OPEN" } })).toBe(0);
    expect(await db.auditEvent.findFirst({ where: { organisationId: org.id, action: "service.moved" } })).toMatchObject({ summary: "Moved Old hosting plan A to our own servers" });
  });

  it("welcomes everyone from 08:00 on the cutover date an admin chose, and only then", async () => {
    const batch = await db.migrationBatch.findFirstOrThrow({ where: { status: "IMPORTED", records: { some: { sourceRef: `${ref("kgosi")}:${owner}` } } } });
    await expect(setCutover({ db, staff: admin }, batch.id, day(-1))).rejects.toMatchObject({ field: "cutoverOn" });
    await setCutover({ db, staff: admin }, batch.id, day(1));
    const tomorrow = parseDateOnly(day(1))!;
    // 06:00 Gaborone (04:00 UTC) on the day: too early.
    expect(await sendWelcomes({ db, now: new Date(tomorrow.getTime() + 4 * 3_600_000) })).toBe(0);
    const nine = new Date(tomorrow.getTime() + 7 * 3_600_000);
    expect(await sendWelcomes({ db, now: nine })).toBeGreaterThanOrEqual(2);
    expect(await sendWelcomes({ db, now: nine })).toBe(0);
    await expect(setCutover({ db, staff: admin }, batch.id, day(3))).rejects.toMatchObject({ code: "conflict" });

    const email = new MemoryEmailAdapter();
    await deliverDue(db, email, nine, 50, { toAddress: owner, kind: "migration.welcome" });
    const welcome = email.sent.find((m) => m.to === owner)!;
    expect(welcome.subject).toBe(`Kgosi Builders ${tag}'s account is ready on Fourth Generation Technologies Cloud Console`);
    expect(welcome.text).toContain("Choose your password");
    expect(welcome.text).toContain("/reset-password/");
    expect(welcome.text).not.toMatch(/!|—/);
  });

  it("sends legacy products to WHMCS hidden, and keeps them out of the catalogue", async () => {
    const plan = await planSync(db);
    const op = plan.operations.find((o) => o.ref === `product:${legacySlug("Managed support plan")}`);
    expect(op).toMatchObject({ op: "product", hidden: true, perUser: false });
    expect(Object.values((op as { prices: Record<string, string> }).prices).every((p) => p === "0.00")).toBe(true);
    await expect(saveFamily({ db, staff: admin, month: monthOf(new Date()) }, { key: "legacy", name: "Legacy services", description: "x", connector: "SERVICES", status: "LIVE", sortOrder: "99" }, "legacy")).rejects.toMatchObject({ fieldErrors: { status: expect.any(String) } });
  });

  it("stops on a half-written row and carries on once staff clear it", async () => {
    const t2 = Math.random().toString(36).slice(2, 8);
    const email2 = uniqueEmail("tumi");
    const batch = await uploadExports({ db, staff: admin }, [
      { file: "customers", name: "c.csv", text: `ID,Name,Email,Country\n__export__.tumi_${t2},Tumi Traders ${t2},${email2},BW` },
      { file: "services", name: "s.csv", text: `Order Reference,Customer/ID,Recurring Plan,Next Invoice,Order Lines/Product,Order Lines/Quantity,Order Lines/Unit Price\nSUB/${t2},__export__.tumi_${t2},Monthly,${day(12)},Web hosting,1,120` },
    ]);
    await approveImport({ db, staff: admin }, batch.id, batch.reportHash);
    // A run that died after starting the service write.
    await db.migrationRecord.create({ data: { batchId: batch.id, kind: "service", sourceRef: `SUB/${t2}#1` } });
    await runApprovedImports({ db, adapter: stub(), linkProducts });
    const failed = await db.migrationBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toContain(`service SUB/${t2}#1`);
    await expect(carryOn({ db, staff: admin }, batch.id, false)).rejects.toMatchObject({ code: "conflict" });
    await carryOn({ db, staff: admin }, batch.id, true);
    await runApprovedImports({ db, adapter: stub(), linkProducts });
    expect(await db.migrationBatch.findUniqueOrThrow({ where: { id: batch.id } })).toMatchObject({ status: "IMPORTED" });
    const org = await db.organisation.findFirstOrThrow({ where: { name: `Tumi Traders ${t2}` } });
    expect(await (await scopedBilling(db, stub(), org.id)).listServices()).toHaveLength(1);
  });
});

describe("Odoo example files", () => {
  it("read cleanly, so the downloads match what the import expects", () => {
    for (const { key } of ODOO_FILES) {
      const { rows, problems } = readOdooFile(key, ODOO_TEMPLATES[key]);
      expect(problems, key).toEqual([]);
      expect(rows.length, key).toBeGreaterThan(0);
    }
    const services = readOdooFile("services", ODOO_TEMPLATES.services).rows;
    expect(services[1].subscription).toBe("SUB/2026/0042");
    expect(readCycle(services[1].plan)).toBe("monthly");
  });
});
