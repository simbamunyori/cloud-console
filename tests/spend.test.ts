import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { completeTask } from "../src/server/admin/tasks";
import type { Invoice, Service } from "../src/server/billing/adapter";
import { parseCsv } from "../src/server/spend/csv";
import { breakdown, forecast, invoiceLines, monthlySpend, savings, savingsTotal, syncInvoiceSpend, type UsageRow } from "../src/server/spend/spend";
import { addSaving, askForSaving, dismissSaving } from "../src/server/spend/tips";
import { customerPrice, idleKey, importUsage, linkSubscription, parseMicros, parseUsageDay, readUsageFile, resourceParts } from "../src/server/spend/usage";
import type { StaffActor } from "../src/server/staff/access";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { scopedBilling } from "../src/server/billing/scoped";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const P = (n: bigint) => ({ amountMinor: n, currency: "BWP" });

describe("reading usage files", () => {
  it("reads quoted fields, doubled quotes, CRLF and a byte order mark", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nlast,\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["last", ""],
    ]);
  });

  it("reads Partner Center's columns, adding rows for the same resource, day and meter", () => {
    const sub = "3F2B8C1E-0A4D-4B7E-9C61-2D5E8F7A1B90";
    const uri = `/subscriptions/${sub}/resourceGroups/Web-RG/providers/Microsoft.Compute/virtualMachines/web1`;
    const file = [
      "PartnerId,EntitlementId,Usage Date,MeterCategory,ResourceUri,BillingPreTaxTotal,BillingCurrency",
      `p,${sub},9/14/2026,Virtual Machines,${uri},1.25,USD`,
      `p,${sub},9/14/2026,Virtual Machines,${uri},0.500001,USD`,
      `p,${sub},2026-09-15T00:00:00Z,Storage,,0.10,usd`,
      `p,,9/14/2026,Storage,,0.10,USD`,
      `p,${sub},not a date,Storage,,0.10,USD`,
    ].join("\n");
    const { rows, rowsRead, skipped } = readUsageFile(file);
    expect(rowsRead).toBe(5);
    expect(skipped).toBe(2);
    expect(rows).toEqual([
      expect.objectContaining({ subscription: sub.toLowerCase(), resourceGroup: "web-rg", resource: "web1", resourceType: "Microsoft.Compute/virtualMachines", category: "Virtual Machines", micros: 1_750_001n, currency: "USD" }),
      expect.objectContaining({ day: new Date("2026-09-15T00:00:00Z"), resource: "", category: "Storage", micros: 100_000n }),
    ]);
  });

  it("says which column is missing", () => {
    expect(() => readUsageFile("SubscriptionId,Date,MeterCategory,Cost\nx,2026-09-01,Storage,1")).toThrow(/currency/);
  });

  it("parses amounts, dates and resource ids", () => {
    expect(parseMicros("12.3456785")).toBe(12_345_679n);
    expect(parseMicros("-0.5")).toBe(-500_000n);
    expect(parseMicros("1,204.10")).toBe(1_204_100_000n);
    expect(parseMicros("abc")).toBeNull();
    expect(parseUsageDay("09/01/2026")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parseUsageDay("2026-02-30")).toBeNull();
    expect(resourceParts("/subscriptions/s/resourceGroups/rg1/providers/Microsoft.Network/publicIPAddresses/ip1")).toEqual({ group: "rg1", type: "Microsoft.Network/publicIPAddresses", name: "ip1" });
  });

  it("prices usage with our margin and the month's rate", () => {
    // $10.00 plus 15% is $11.50; at 13.45 pula to the dollar, P 154.675, rounded up.
    expect(customerPrice(10_000_000n, "BWP", 1500, 13_450_000n)).toBe(15468n);
  });
});

describe("spend views", () => {
  const today = new Date("2026-09-20T00:00:00Z");
  const services = [
    { serviceId: "1", name: "Microsoft 365 Business Standard", groupName: "Productivity", status: "active", quantity: 10, recurring: P(190000n), billingCycle: "monthly" },
    { serviceId: "2", name: "Managed VPS, medium", groupName: "Servers", status: "active", quantity: 1, recurring: P(85000n), billingCycle: "monthly" },
  ] as Service[];

  it("groups invoice lines by the group of the service each is for", () => {
    const invoice = {
      lines: [
        { lineId: "a", kind: "service", relatedId: "1", description: "M365", amount: P(190000n), taxed: true },
        { lineId: "b", kind: "prorata", relatedId: "1", description: "M365 part month", amount: P(12000n), taxed: true },
        { lineId: "c", kind: "domain", relatedId: "9", description: "kgalehill.co.bw", amount: P(18000n), taxed: true },
        { lineId: "d", kind: "item", description: "Late fee\nfor August", amount: P(5000n), taxed: true },
      ],
    } as Invoice;
    expect(invoiceLines(invoice, services)).toEqual([
      { category: "Productivity", label: "Microsoft 365 Business Standard", amountMinor: 202000n },
      { category: "Domains", label: "Domain names", amountMinor: 18000n },
      { category: "Other", label: "Late fee", amountMinor: 5000n },
    ]);
  });

  const usage = (day: string, priceMinor: bigint, category = "Virtual Machines"): UsageRow => ({ day: new Date(`${day}T00:00:00Z`), subscriptionId: "s", resourceGroup: "rg", category, priceMinor, currency: "BWP" });

  it("adds invoices and usage by month, leaving out cancelled invoices and months before any spend", () => {
    const kept = [
      { month: new Date("2026-08-01"), status: "paid", currency: "BWP", lines: [{ category: "Productivity", amountMinor: "190000" }] },
      { month: new Date("2026-08-01"), status: "cancelled", currency: "BWP", lines: [{ category: "Servers", amountMinor: "85000" }] },
      { month: new Date("2026-09-01"), status: "unpaid", currency: "BWP", lines: [{ category: "Productivity", amountMinor: "190000" }, { category: "Servers", amountMinor: "85000" }] },
    ];
    const months = monthlySpend(kept, [usage("2026-09-02", 1000n), usage("2026-09-03", 500n)], "BWP", today);
    expect(months).toHaveLength(6);
    expect(months[0].month.toISOString().slice(0, 7)).toBe("2026-04");
    expect(months.map((m) => m.total)).toEqual([0n, 0n, 0n, 0n, 190000n, 276500n]);
    expect(months[5].byCategory.map((c) => c.category)).toEqual(["Productivity", "Servers", "Azure usage"]);
    expect(breakdown(months, 5)).toEqual([
      { category: "Productivity", amountMinor: 190000n, previousMinor: 190000n },
      { category: "Servers", amountMinor: 85000n, previousMinor: 0n },
      { category: "Azure usage", amountMinor: 1500n, previousMinor: 0n },
    ]);
  });

  it("forecasts running services plus usage at this month's pace, or last month's when none is in yet", () => {
    const pace = forecast(services, [usage("2026-09-01", 1000n), usage("2026-09-10", 1000n)], "BWP", today);
    // P 20 over 10 days is P 60 for September's 30.
    expect(pace).toMatchObject({ fixed: P(275000n), usage: P(6000n), usageBasis: "pace", total: P(281000n) });
    const early = forecast(services, [usage("2026-08-05", 4000n)], "BWP", new Date("2026-09-01T00:00:00Z"));
    expect(early).toMatchObject({ usage: P(4000n), usageBasis: "last-month", total: P(279000n) });
    // Invoiced beyond the monthly price (a setup charge) counts instead.
    expect(forecast(services, [], "BWP", today, 300000n).total).toEqual(P(300000n));
  });

  it("lists unused licences first, then open tips largest first, and adds up only the open ones", () => {
    const tip = (id: string, monthlyMinor: bigint, status: "OPEN" | "ASKED" | "DISMISSED") => ({ id, key: id, source: "AUTO" as const, title: id, detail: "", monthlyMinor, currency: "BWP", status });
    const list = savings([{ vendorLabel: "Microsoft 365", name: "Microsoft 365 Business Standard", unused: 2, purchased: 12 }], services, [tip("small", 100n, "OPEN"), tip("big", 900n, "OPEN"), tip("asked", 500n, "ASKED"), tip("hidden", 700n, "DISMISSED")]);
    expect(list.map((s) => s.key)).toEqual(["lic-Microsoft 365 Business Standard", "big", "asked", "small"]);
    expect(list[0].monthly).toEqual(P(38000n));
    expect(savingsTotal(list, "BWP")).toEqual(P(39000n));
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Kagiso Finance", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

describe.skipIf(!hasDb)("Azure usage and savings", () => {
  beforeAll(async () => {
    for (const month of ["2026-07", "2026-08"]) {
      await db.fxRate.upsert({ where: { month_base_quote: { month, base: "EUR", quote: "BWP" } }, update: { rateMicros: 15_000_000n }, create: { month, base: "EUR", quote: "BWP", rateMicros: 15_000_000n } });
    }
  });

  /** Daily rows for August: the web servers ran until the 20th, their disk every day. */
  function file(sub: string, from = 1, to = 31) {
    const rows = ["EntitlementId,UsageDate,MeterCategory,ResourceUri,BillingPreTaxTotal,BillingCurrency"];
    const res = (type: string, name: string) => `/subscriptions/${sub}/resourceGroups/web/providers/${type}/${name}`;
    for (let d = from; d <= to; d++) {
      const day = `2026-08-${String(d).padStart(2, "0")}`;
      if (d <= 20) rows.push(`${sub},${day},Virtual Machines,${res("Microsoft.Compute/virtualMachines", "web1")},2.00,EUR`);
      rows.push(`${sub},${day},Storage,${res("Microsoft.Compute/disks", "web1-os")},0.20,EUR`);
    }
    return rows.join("\n");
  }

  it("imports usage for linked subscriptions, replaces days uploaded again, and flags switched-off servers", async () => {
    const org = await makeOrganisation("Palapye Printers");
    const finance = await staff("FINANCE");
    const sub = randomUUID();
    const stranger = randomUUID();
    await expect(linkSubscription({ db, staff: finance }, org.organisationId, { subscriptionId: "nope", name: "", margin: "150" })).rejects.toMatchObject({ fieldErrors: { subscriptionId: expect.any(String), name: expect.any(String), margin: expect.any(String) } });
    await expect(importUsage({ db, staff: await staff("SUPPORT") }, "u.csv", file(sub))).rejects.toMatchObject({ code: "forbidden" });
    await linkSubscription({ db, staff: finance }, org.organisationId, { subscriptionId: sub.toUpperCase(), name: "Production", margin: "10" });

    const extra = `\n${stranger},2026-08-01,Storage,,1.00,EUR\n${sub},2026-06-30,Storage,,1.00,EUR`;
    const first = await importUsage({ db, staff: finance }, "u.csv", file(sub) + extra);
    expect(first).toMatchObject({ rowsRead: 53, rowsImported: 51, customers: 1 });
    expect(first.notes.join(" ")).toMatch(new RegExp(`${stranger}.*`));
    expect(first.notes.join(" ")).toMatch(/No exchange rate EUR to BWP for 2026-06/);

    // €2.20 a day with 10% margin at 15 pula: P 36.30 a day for 20 days, then P 3.30.
    const total = await org.tenant.cloudUsage.aggregate({ _sum: { priceMinor: true } });
    expect(total._sum.priceMinor).toBe(20n * 3630n + 11n * 330n);
    const [tip] = await org.tenant.savingTip.findMany();
    expect(tip).toMatchObject({ key: idleKey(sub, "web"), source: "AUTO", status: "OPEN", monthlyMinor: 9900n });

    // A corrected file for the last week: the servers were running after all.
    const fixed = ["EntitlementId,UsageDate,MeterCategory,ResourceUri,BillingPreTaxTotal,BillingCurrency"];
    for (let d = 25; d <= 31; d++) fixed.push(`${sub},2026-08-${d},Virtual Machines,/subscriptions/${sub}/resourceGroups/web/providers/Microsoft.Compute/virtualMachines/web1,2.00,EUR`);
    await importUsage({ db, staff: finance }, "fix.csv", fixed.join("\n"));
    expect(await org.tenant.cloudUsage.count({ where: { day: { gte: new Date("2026-08-25") } } })).toBe(7);
    expect(await org.tenant.savingTip.count()).toBe(0);

    // Another customer can't take the subscription.
    const other = await makeOrganisation("Kasane Kayaks");
    await expect(linkSubscription({ db, staff: finance }, other.organisationId, { subscriptionId: sub, name: "Mine", margin: "10" })).rejects.toMatchObject({ code: "conflict" });
    expect(await other.tenant.cloudUsage.count()).toBe(0);
  });

  it("turns a saving into a staff task, marks it done with the task, and keeps a hidden one hidden", async () => {
    const org = await makeOrganisation("Maun Movers");
    const finance = await staff("FINANCE");
    const sub = randomUUID();
    await linkSubscription({ db, staff: finance }, org.organisationId, { subscriptionId: sub, name: "Production", margin: "10" });
    await importUsage({ db, staff: finance }, "u.csv", file(sub));
    const advisor = await addSaving({ db, staff: finance }, org.organisationId, { title: "The web server is bigger than it needs to be", detail: "It uses a tenth of its processors.", monthly: "450" });
    expect(advisor).toMatchObject({ source: "STAFF", monthlyMinor: 45000n, currency: "BWP" });
    await expect(addSaving({ db, staff: finance }, org.organisationId, { title: "x", detail: "", monthly: "free" })).rejects.toMatchObject({ code: "invalid" });

    const ctx = { organisationId: org.organisationId, organisationName: "Maun Movers", actor: org.owner };
    const reader = await addMember(org.organisationId, "READ_ONLY");
    await expect(askForSaving(org.tenant, { ...ctx, actor: reader }, advisor.id)).rejects.toMatchObject({ code: "forbidden" });
    const asked = await askForSaving(org.tenant, ctx, advisor.id);
    expect(asked.status).toBe("ASKED");
    await expect(askForSaving(org.tenant, ctx, advisor.id)).rejects.toMatchObject({ code: "conflict" });
    const task = await db.provisioningTask.findUniqueOrThrow({ where: { id: asked.taskId! } });
    expect(task).toMatchObject({ kind: "saving", family: "PUBLIC_CLOUD" });
    await completeTask({ db, adapter: new StubBillingAdapter(db), staff: await staff("PROVISIONING") }, task.id);
    expect((await db.savingTip.findUniqueOrThrow({ where: { id: advisor.id } })).status).toBe("DONE");

    const idle = await org.tenant.savingTip.findFirstOrThrow({ where: { source: "AUTO" } });
    await dismissSaving(org.tenant, ctx, idle.id);
    await importUsage({ db, staff: finance }, "again.csv", file(sub));
    expect((await db.savingTip.findUniqueOrThrow({ where: { id: idle.id } })).status).toBe("DISMISSED");

    const other = await makeOrganisation("Ghanzi Grain");
    await expect(dismissSaving(other.tenant, { ...ctx, organisationId: other.organisationId, actor: other.owner }, idle.id)).rejects.toMatchObject({ code: "not-found" });
    const log = await org.tenant.auditEvent.findMany({ where: { OR: [{ action: { startsWith: "saving." } }, { action: { startsWith: "cloud." } }] }, orderBy: { createdAt: "asc" } });
    expect(log.map((e) => e.action)).toEqual(["cloud.subscription_linked", "cloud.usage_imported", "saving.added", "saving.asked", "saving.dismissed", "cloud.usage_imported"]);
  });
});

describe.skipIf(!hasDb)("kept invoice spend", () => {
  it("reads each invoice once, and again only when its status or total changes", async () => {
    const ids = await seedStubCatalogue(db);
    const org = await makeOrganisation("Lobatse Leather");
    const stub = new StubBillingAdapter(db);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const order = await billing.placeOrder({ paymentMethod: "banktransfer", createInvoice: true, items: [{ productId: ids["vps-small"], quantity: 1, billingCycle: "monthly", recurringPrice: P(45000n) }] });
    await stub.acceptOrder(order.orderId);
    let reads = 0;
    const counting = { listInvoices: () => billing.listInvoices(), listServices: () => billing.listServices(), getInvoice: (id: string) => (reads++, billing.getInvoice(id)) };
    const today = new Date();
    await syncInvoiceSpend(org.tenant, counting, org.organisationId, today);
    await syncInvoiceSpend(org.tenant, counting, org.organisationId, today);
    expect(reads).toBe(1);
    const [kept] = await org.tenant.invoiceSpend.findMany();
    expect(kept).toMatchObject({ status: "unpaid", lines: [{ category: "Servers", label: "Managed VPS, small", amountMinor: "45000" }] });

    const [invoice] = await billing.listInvoices();
    await stub.recordPayment(invoice.invoiceId, { amount: invoice.total, gateway: "banktransfer", reference: "FNB 1", paidAt: new Date() });
    await syncInvoiceSpend(org.tenant, counting, org.organisationId, today);
    expect(reads).toBe(2);
    expect((await org.tenant.invoiceSpend.findFirstOrThrow()).status).toBe("paid");
  });
});
