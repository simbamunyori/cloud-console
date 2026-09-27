/**
 * Demo data for development and demos: the stub billing engine's catalogue
 * and domain prices, one customer organisation with six months of history,
 * and a staff account. Run with `npm run db:seed`. Safe to run again: it
 * leaves an existing demo organisation alone.
 *
 * It refuses to run in production unless SEED_DEMO=yes, because the demo
 * accounts have a published password.
 */
import { type Prisma, PrismaClient } from "@prisma/client";
import { addDays, addMonths, startOfMonth, todayIn } from "../src/lib/dates";
import { money } from "../src/lib/domain/money";
import { DEFAULT_TIME_ZONE } from "../src/config/app";
import { hashPassword } from "../src/server/auth/password";
import { PAYMENT_METHODS } from "../src/server/billing/adapter";
import { ensureBillingAccount } from "../src/server/billing/accounts";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { scopedBilling } from "../src/server/billing/scoped";
import { tenantDb } from "../src/server/db";
import { placeOrder } from "../src/server/orders/orders";

const db = new PrismaClient();
const DEMO_PASSWORD = "demo-password-2026";
const SLUG = "kgale-hill-logistics";
const P = (minor: bigint) => money(minor, "BWP");

const STAFF_NAMES = [
  "Neo Kgosi",
  "Kabo Molefe",
  "Mpho Dube",
  "Lesego Phiri",
  "Thato Mosweu",
  "Boitumelo Seretse",
  "Onalenna Tau",
  "Kagiso Ramotswa",
  "Masego Kgari",
  "Tebogo Nkwe",
  "Refilwe Motsumi",
  "Gorata Pule",
];
const mailbox = (name: string) => `${name.split(" ")[0].toLowerCase()}@kgalehill.co.bw`;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "yes") {
    throw new Error("Not seeding demo accounts in production. Set SEED_DEMO=yes if you really mean it.");
  }

  const products = await seedStubCatalogue(db);
  console.log(`Stub catalogue: ${Object.keys(products).length} products and domain prices loaded.`);
  const thisMonth = startOfMonth(todayIn(DEFAULT_TIME_ZONE));
  await seedCatalogue(db, products, [-1, 0, 1].map((m) => addMonths(thisMonth, m).toISOString().slice(0, 7)));
  console.log("Marketplace catalogue loaded, with placeholder margins, buffer and exchange rate.");

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  // One staff account per role, so each part of /admin can be tried.
  const staffAccounts = [
    { email: "staff@example.co.bw", name: "Duduetsang Staff", staffRole: "ADMIN" as const },
    { email: "finance@example.co.bw", name: "Kagiso Finance", staffRole: "FINANCE" as const },
    { email: "setup@example.co.bw", name: "Onalenna Setup", staffRole: "PROVISIONING" as const },
    { email: "support@example.co.bw", name: "Boitumelo Support", staffRole: "SUPPORT" as const },
  ];
  for (const s of staffAccounts) {
    await db.user.upsert({ where: { email: s.email }, update: {}, create: { ...s, kind: "STAFF", passwordHash } });
  }

  if (await db.membership.findFirst({ where: { user: { email: "demo@kgalehill.co.bw" } } })) {
    console.log("The demo organisation is already there; leaving it as it is.");
    return;
  }

  // ─── The organisation and its people ────────────────────────────────
  const org = await db.organisation.create({
    data: {
      name: "Kgale Hill Logistics",
      slug: (await db.organisation.findUnique({ where: { slug: SLUG } })) ? `${SLUG}-${Date.now().toString(36)}` : SLUG,
      registrationNumber: "BW00001234567",
      billingEmail: "accounts@kgalehill.co.bw",
      phone: "+267 391 2345",
      addressLine1: "Plot 64518, Fairgrounds",
      city: "Gaborone",
      defaultPoNumber: "KHL-2026-IT",
    },
  });
  const people = [
    { name: "Neo Kgosi", email: "demo@kgalehill.co.bw", role: "OWNER" as const },
    { name: "Kabo Molefe", email: "kabo@kgalehill.co.bw", role: "ADMIN" as const },
    { name: "Mpho Dube", email: "accounts@kgalehill.co.bw", role: "BILLING" as const },
    { name: "Lesego Phiri", email: "lesego@kgalehill.co.bw", role: "READ_ONLY" as const },
  ];
  for (const p of people) {
    const user = await db.user.upsert({ where: { email: p.email }, update: {}, create: { email: p.email, name: p.name, passwordHash } });
    await db.membership.create({ data: { organisationId: org.id, userId: user.id, role: p.role } });
  }

  // ─── Six months of billing, played forward on the stub's clock ─────
  const today = todayIn(DEFAULT_TIME_ZONE);
  const start = addMonths(startOfMonth(today), -6);
  let clock = start;
  const stub = new StubBillingAdapter(db, { now: () => new Date(clock.getTime() + 9 * 3_600_000) });
  const at = (d: Date) => new Date(d.getTime() + 10 * 3_600_000);

  const account = await ensureBillingAccount(db, stub, org.id);
  const clientId = account.externalClientId;

  const users = (n: number) => STAFF_NAMES.slice(0, n).map((name) => ({ name, email: mailbox(name) }));
  const order = await stub.placeOrder(clientId, {
    paymentMethod: PAYMENT_METHODS.eft,
    createInvoice: true,
    items: [
      { productId: products["m365-standard"], quantity: 10, billingCycle: "monthly", recurringPrice: P(190000n), domain: "kgalehill.co.bw" },
      { productId: products["backup-m365"], quantity: 10, billingCycle: "monthly", recurringPrice: P(35000n) },
      { productId: products["vps-medium"], quantity: 1, billingCycle: "monthly", recurringPrice: P(85000n), options: { "Operating system": "Ubuntu 24.04 LTS", Location: "Gaborone" } },
      { productId: products["web-hosting"], quantity: 1, billingCycle: "monthly", recurringPrice: P(12000n), domain: "kgalehill.co.bw" },
    ],
  });
  await stub.acceptOrder(order.orderId);
  const domain = await stub.registerDomain(clientId, { name: "kgalehill.co.bw", years: 1, price: P(18000n), paymentMethod: PAYMENT_METHODS.eft });
  await stub.acceptOrder(domain.orderId);

  const [m365, backup, vps, web] = order.serviceIds.map(Number);
  const setDetails = (id: number, details: Prisma.InputJsonValue) => db.stubService.update({ where: { id }, data: { details } });
  await setDetails(m365, { users: users(10), resources: [{ label: "Plan", value: "Business Standard" }, { label: "Domain", value: "kgalehill.co.bw" }] });
  await setDetails(backup, { resources: [{ label: "Protected mailboxes", value: "10" }, { label: "Kept for", value: "1 year" }], usage: [{ label: "Backup storage", used: 212, limit: null, unit: "GB" }] });
  await setDetails(vps, {
    resources: [
      { label: "Operating system", value: "Ubuntu 24.04 LTS" },
      { label: "Location", value: "Gaborone" },
      { label: "Processors", value: "4 vCPU" },
      { label: "Memory", value: "8 GB" },
      { label: "IP address", value: "196.45.10.24" },
    ],
    usage: [
      { label: "Disk", used: 61, limit: 160, unit: "GB" },
      { label: "Data transfer this month", used: 420, limit: 2000, unit: "GB" },
    ],
  });
  await setDetails(web, { resources: [{ label: "Site", value: "kgalehill.co.bw" }, { label: "Control panel", value: "DirectAdmin" }], usage: [{ label: "Disk", used: 3.4, limit: 20, unit: "GB" }] });

  await stub.addPayMethod(clientId, { gateway: PAYMENT_METHODS.card, gatewayToken: "stub_tok_demo", cardBrand: "Visa", lastFour: "4242", expiry: "08/29", setDefault: true });

  let receipt = 88100;
  const payAll = async (on: Date, gateway: string = PAYMENT_METHODS.eft) => {
    for (const inv of await stub.listInvoices(clientId, { status: "unpaid" })) {
      await stub.recordPayment(inv.invoiceId, { amount: inv.total, gateway, reference: gateway === PAYMENT_METHODS.eft ? `FNB ${receipt++}` : `stub_ch_${receipt++}`, paidAt: at(on) });
    }
  };
  await payAll(addDays(start, 2));

  for (let month = 1; month <= 7; month++) {
    const monthStart = addMonths(start, month);
    if (monthStart > addDays(today, 7)) break;
    // Three months in, two new people join: seats go from 10 to 12 mid-month.
    if (month === 3) {
      clock = addDays(addMonths(start, 2), 14);
      await stub.upgradeService(String(m365), { quantity: 12, recurringPrice: P(228000n) }, PAYMENT_METHODS.eft);
      await stub.upgradeService(String(backup), { quantity: 12, recurringPrice: P(42000n) }, PAYMENT_METHODS.eft);
      await setDetails(m365, { users: users(12), resources: [{ label: "Plan", value: "Business Standard" }, { label: "Domain", value: "kgalehill.co.bw" }] });
      await payAll(clock, PAYMENT_METHODS.card);
    }
    clock = addDays(monthStart, -7);
    await stub.runBillingCycle();
    // Every month is paid a few days after it falls due, except the latest.
    const latest = addMonths(monthStart, 1) > addDays(today, 7);
    if (!latest) await payAll(addDays(monthStart, 3), month % 2 ? PAYMENT_METHODS.eft : PAYMENT_METHODS.card);
  }

  // A purchase order number on the latest invoice, kept by the console and
  // copied into the engine's notes (see docs/whmcs-mapping.md).
  const [latestInvoice] = await stub.listInvoices(clientId);
  if (latestInvoice) {
    await db.invoicePoNumber.create({ data: { organisationId: org.id, invoiceId: latestInvoice.invoiceId, poNumber: "KHL-2026-IT" } });
    await stub.setPurchaseOrder(latestInvoice.invoiceId, "KHL-2026-IT");
  }

  // Something for staff to do: a server being set up, and a bank transfer to check.
  const owner = await db.membership.findFirstOrThrow({ where: { organisationId: org.id, role: "OWNER" }, include: { user: true } });
  const tenant = tenantDb(org.id);
  const orgRow = await db.organisation.findUniqueOrThrow({ where: { id: org.id } });
  clock = today;
  await placeOrder(
    { db: tenant, billing: await scopedBilling(db, stub, org.id), organisation: orgRow, actor: { membershipId: owner.id, userId: owner.userId, name: owner.user.name, role: "OWNER" } },
    { slug: "managed-vps-small", quantity: 1, options: { os: "Ubuntu 24.04 LTS" } },
  );
  if (latestInvoice) {
    const invoice = await stub.getInvoice(clientId, latestInvoice.invoiceId);
    if (invoice && invoice.balance.amountMinor > 0n) {
      await db.eftPayment.create({
        data: { organisationId: org.id, invoiceId: invoice.invoiceId, amountMinor: invoice.balance.amountMinor, currency: invoice.balance.currency, reference: invoice.number, paidOn: today, reportedById: owner.userId },
      });
    }
  }

  const invoices = await stub.listInvoices(clientId);
  console.log(`Demo organisation: Kgale Hill Logistics, ${invoices.length} invoices from ${start.toISOString().slice(0, 10)}.`);
  console.log(`Sign in as demo@kgalehill.co.bw (owner), or at /admin as staff@, finance@, setup@ or support@example.co.bw, password ${DEMO_PASSWORD}.`);
  console.log("You'll set up an authenticator app at first sign-in.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
