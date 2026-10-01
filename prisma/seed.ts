/**
 * Demo data for development and demos: the stub billing engine's catalogue
 * and domain prices, one customer organisation with six months of history,
 * and a staff account. Run with `npm run db:seed`. Safe to run again: it
 * leaves an existing demo organisation alone.
 *
 * It refuses to run in production unless SEED_DEMO=yes, because the demo
 * accounts have a published password.
 */
import { createHash, randomBytes } from "node:crypto";
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
import { linkTenant, recordLicence, recordTenantUser } from "../src/server/licences/licences";
import { openTicket } from "../src/server/support/tickets";
import { addSaving } from "../src/server/spend/tips";
import { importUsage, linkSubscription } from "../src/server/spend/usage";
import { requestQuote, saveQuote, sendQuote } from "../src/server/quotes/quotes";
import { createLead } from "../src/server/sales/leads";
import { syncStubTaxRules } from "../src/server/markets/tax-sync";
import { uploadExports } from "../src/server/migration/run";

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

  // Demo bank details for the Botswana market. Staff enter the real ones at /admin/markets.
  await db.market.updateMany({
    where: { code: "bw", eftBankName: null },
    data: { eftBankName: "Demo Bank Botswana", eftAccountName: "Fourth Generation Technologies (Pty) Ltd", eftAccountNumber: "000000000000", eftBranchCode: "000000" },
  });
  await syncStubTaxRules(db);

  const products = await seedStubCatalogue(db);
  console.log(`Stub catalogue: ${Object.keys(products).length} products and domain prices loaded.`);
  const thisMonth = startOfMonth(todayIn(DEFAULT_TIME_ZONE));
  await seedCatalogue(db, products, [-1, 0, 1].map((m) => addMonths(thisMonth, m).toISOString().slice(0, 7)));
  console.log("Marketplace catalogue loaded, with placeholder margins, buffer, exchange rates and price books.");
  // The launch catalogue keeps plans internal until staff price them; the demo shows them live with demo prices.
  await db.product.updateMany({ where: { categoryKey: "plans", status: "INTERNAL" }, data: { status: "LIVE" } });

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

  // An Odoo upload waiting for approval (Milestone 9b), so /admin/migration has a dry run to show.
  const migrationAdmin = await db.user.findUniqueOrThrow({ where: { email: "staff@example.co.bw" } });
  if (!(await db.migrationBatch.count({ where: { uploadedById: migrationAdmin.id } }))) {
    const admin = migrationAdmin;
    const on = (days: number) => addDays(todayIn(DEFAULT_TIME_ZONE), days).toISOString().slice(0, 10);
    await uploadExports({ db, staff: { userId: admin.id, name: admin.name, staffRole: "ADMIN" } }, [
      {
        file: "customers",
        name: "customers.csv",
        text: [
          "ID,Name,Email,Phone,Street,City,Country,Tax ID",
          "__export__.res_partner_101_demo,Tlokweng Dental Practice,reception@tlokwengdental.example,+267 390 1111,Plot 2210,Tlokweng,Botswana,P01987654321",
          "__export__.res_partner_102_demo,Maun Safari Lodges,office@maunsafari.example,+267 686 2222,Airport Road,Maun,Botswana,",
        ].join("\n"),
      },
      {
        file: "contacts",
        name: "contacts.csv",
        text: ["ID,Related Company/ID,Name,Email,Address Type", "__export__.res_partner_103_demo,__export__.res_partner_101_demo,Dr Lorato Sebina,lorato@tlokwengdental.example,Contact", "__export__.res_partner_104_demo,__export__.res_partner_102_demo,Maun Accounts,accounts@maunsafari.example,Invoice Address"].join("\n"),
      },
      {
        file: "services",
        name: "subscriptions.csv",
        text: [
          "Order Reference,Customer/ID,Recurring Plan,Next Invoice,Start Date,Currency,Order Lines/Product,Order Lines/Quantity,Order Lines/Unit Price,Order Lines/Discount (%),Hosted at,Server or account,Price review date",
          `SUB/2024/0007,__export__.res_partner_101_demo,Monthly,${on(18)},2024-02-01,BWP,Microsoft 365 Business Standard,6,175.00,0,,,${on(150)}`,
          `,,,,,,[BAK-365] Backup for Microsoft 365,6,30.00,0,,,`,
          `SUB/2023/0031,__export__.res_partner_102_demo,Quarterly,${on(40)},2023-06-01,BWP,[WEB-A] Lodge website hosting plan A,1,1350.00,10,Contabo,vps-17 (161.97.0.17),`,
        ].join("\n"),
      },
      { file: "domains", name: "domains.csv", text: ["Domain,Customer ID,Expires on,Renewal price,Registrar", `maunsafari.co.bw,__export__.res_partner_102_demo,${on(95)},310.00,cocca`].join("\n") },
      { file: "invoices", name: "invoices.csv", text: ["Number,Customer/ID,Invoice/Bill Date,Due Date,Amount Due,Total,Currency", `INV/2026/00881,__export__.res_partner_102_demo,${on(-20)},${on(10)},1215.00,1215.00,BWP`].join("\n") },
    ]);
    console.log("Demo Odoo upload: two customers waiting for approval at /admin/migration.");
  }

  // A launch kit (Milestone 7) a Publisher has approved, so the demo has a product page to show.
  const kitProduct = await db.product.findUnique({ where: { slug: "microsoft-365-business-standard" } });
  if (kitProduct?.status === "LIVE" && !(await db.launchKit.findUnique({ where: { productId: kitProduct.id } }))) {
    const admin = await db.user.findUniqueOrThrow({ where: { email: "staff@example.co.bw" } });
    await db.launchKit.create({
      data: {
        productId: kitProduct.id,
        campaign: "launch-microsoft-365-business-standard",
        audience: "Teams of 2 to 300 people who want email on their own name and the Office desktop apps, without running their own servers.",
        faq: [
          { question: "Can we keep our existing email address?", answer: "Yes. We move your mail across to Microsoft 365 on your own domain, with nothing lost." },
          { question: "How many computers can each person use?", answer: "Each person can install the Office desktop apps on up to 5 computers." },
          { question: "Can we add people later?", answer: "Yes. Add or remove people from your console, and the next invoice follows." },
        ],
        linkedinText: "Microsoft 365 Business Standard is now available from Fourth Generation Technologies: email on your own name, the Office desktop apps and Teams, set up and looked after by our team.",
        draftedAt: new Date(),
        pageApprovedAt: new Date(),
        pageApprovedById: admin.id,
        linkedinApprovedAt: new Date(),
        linkedinApprovedById: admin.id,
      },
    });
    console.log("Demo launch kit: Microsoft 365 Business Standard, approved.");
  }

  // A pre-sales engineer with weekday hours (Milestone 8), so the booking page has times to offer.
  const presales = await db.user.findUniqueOrThrow({ where: { email: "support@example.co.bw" } });
  if (!(await db.presalesEngineer.findUnique({ where: { userId: presales.id } }))) {
    await db.presalesEngineer.create({
      data: { userId: presales.id, hours: [1, 2, 3, 4, 5].map((day) => ({ day, from: "09:00", to: "16:00" })), timeZone: DEFAULT_TIME_ZONE },
    });
    console.log("Demo pre-sales hours: Boitumelo Support, weekdays 09:00 to 16:00.");
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
    { slug: "managed-vps-small", quantity: 1, options: { os: "Ubuntu 24.04 LTS" }, startNow: true },
  );
  if (latestInvoice) {
    const invoice = await stub.getInvoice(clientId, latestInvoice.invoiceId);
    if (invoice && invoice.balance.amountMinor > 0n) {
      await db.eftPayment.create({
        data: { organisationId: org.id, invoiceId: invoice.invoiceId, amountMinor: invoice.balance.amountMinor, currency: invoice.balance.currency, reference: invoice.number, paidOn: today, reportedById: owner.userId },
      });
    }
  }

  // A question waiting for the support team.
  await openTicket(
    { db: tenant, organisation: orgRow, actor: { membershipId: owner.id, userId: owner.userId, name: owner.user.name, role: "OWNER" } },
    { subject: "Shared mailbox for deliveries", body: "Hello, can we add a shared mailbox deliveries@kgalehill.co.bw that Kabo and Lesego can both read? Does it need its own licence?" },
  );

  // Their Microsoft 365 tenant, as staff recorded it: 12 Business Standard
  // licences, 10 held, one new starter without one yet and one leaver.
  // Two unused licences show on Home.
  const setupStaff = await db.user.findUniqueOrThrow({ where: { email: "setup@example.co.bw" } });
  const recorder = { db, staff: { userId: setupStaff.id, name: setupStaff.name, staffRole: "PROVISIONING" as const } };
  const ms = await linkTenant(recorder, org.id, { vendor: "MICROSOFT", primaryDomain: "kgalehill.co.bw" });
  const standard = await recordLicence(recorder, org.id, { tenantId: ms.id, sku: "O365_BUSINESS_STANDARD", name: "Microsoft 365 Business Standard", purchased: 12 });
  for (const [i, name] of STAFF_NAMES.entries()) {
    const person = await recordTenantUser(recorder, org.id, { tenantId: ms.id, name, email: mailbox(name), licenceIds: i < 10 ? [standard.id] : [] });
    await db.tenantUser.update({ where: { id: person.id }, data: { lastSignInAt: i === 10 ? null : addDays(today, -(i % 4)), enabled: i !== 11 } });
  }

  // Azure: a subscription with two months of usage, uploaded as staff
  // would upload the Partner Center file. The test servers were switched
  // off ten days ago but their disks still cost money, which shows as a
  // saving; staff also found an oversized server in Azure Advisor. The
  // last two months are ready for finance to invoice.
  const finance = await db.user.findUniqueOrThrow({ where: { email: "finance@example.co.bw" } });
  const cloudStaff = { userId: finance.id, name: finance.name, staffRole: "FINANCE" as const };
  const SUB = "3f2b8c1e-0a4d-4b7e-9c61-2d5e8f7a1b90";
  const linked = await linkSubscription({ db, staff: cloudStaff }, org.id, { subscriptionId: SUB, name: "Kgale Hill production", margin: "15" });
  // A monthly budget a little over what the subscription usually costs.
  await db.cloudSubscription.update({ where: { id: linked.id }, data: { budgetMinor: 900000n } });
  for (let back = 0; back <= 2; back++) {
    const month = addMonths(startOfMonth(today), -back).toISOString().slice(0, 7);
    await db.fxRate.upsert({ where: { month_base_quote: { month, base: "USD", quote: "BWP" } }, update: {}, create: { month, base: "USD", quote: "BWP", rateMicros: 13_450_000n } });
  }
  const usageRows = ["EntitlementId,UsageDate,MeterCategory,ResourceUri,BillingPreTaxTotal,BillingCurrency"];
  const vm = (group: string, name: string) => `/subscriptions/${SUB}/resourceGroups/${group}/providers/Microsoft.Compute/virtualMachines/${name}`;
  const disk = (group: string, name: string) => `/subscriptions/${SUB}/resourceGroups/${group}/providers/Microsoft.Compute/disks/${name}`;
  const ip = (group: string, name: string) => `/subscriptions/${SUB}/resourceGroups/${group}/providers/Microsoft.Network/publicIPAddresses/${name}`;
  const firstUsageDay = addMonths(startOfMonth(today), -2);
  for (let d = firstUsageDay; d < today; d = addDays(d, 1)) {
    const day = d.toISOString().slice(0, 10);
    const wobble = ((d.getUTCDate() * 7) % 5) / 10;
    usageRows.push(`${SUB},${day},Virtual Machines,${vm("kgale-erp", "erp-app-01")},${(9.6 + wobble).toFixed(4)},USD`);
    usageRows.push(`${SUB},${day},Storage,${disk("kgale-erp", "erp-app-01-os")},0.7700,USD`);
    usageRows.push(`${SUB},${day},Bandwidth,${vm("kgale-erp", "erp-app-01")},${(0.4 + wobble / 2).toFixed(4)},USD`);
    usageRows.push(`${SUB},${day},Storage,/subscriptions/${SUB}/resourceGroups/kgale-backups/providers/Microsoft.Storage/storageAccounts/kgalebackups,1.1200,USD`);
    if (d < addDays(today, -10)) usageRows.push(`${SUB},${day},Virtual Machines,${vm("kgale-test", "test-web-01")},3.8400,USD`);
    usageRows.push(`${SUB},${day},Storage,${disk("kgale-test", "test-web-01-os")},0.6400,USD`);
    usageRows.push(`${SUB},${day},Virtual Network,${ip("kgale-test", "test-web-01-ip")},0.1200,USD`);
  }
  await importUsage({ db, staff: cloudStaff }, "DailyRatedUsage_KgaleHill.csv", usageRows.join("\n"));
  await addSaving({ db, staff: cloudStaff }, org.id, {
    title: "The ERP server is bigger than it needs to be",
    detail: "erp-app-01 has used under a fifth of its processors for the last month. A size down keeps plenty of headroom and halves its cost. We'd make the change on a Sunday morning, with about five minutes of downtime.",
    monthly: "2300.00",
  });

  // Quotes: a request from the website for staff to price, and a quote sent to the demo organisation.
  await requestQuote(
    db,
    { name: "Tsholofelo Sithole", company: "Okavango Lodges", email: "tsholofelo@okavangolodges.example", phone: "+267 686 0000", country: "BW", need: "Email and file sharing for 40 staff across three lodges near Maun, moving from a local server. We'd like someone to do the move over a weekend." },
    { market: "bw" },
  );
  const asked = await requestQuote(
    db,
    { name: owner.user.name, company: orgRow.name, email: owner.user.email, phone: orgRow.phone ?? "+267 391 2345", country: "BW", need: "Support for our depot in Francistown as well as Gaborone, with someone on site twice a month." },
    { market: "bw", organisationId: org.id, userId: owner.userId },
  );
  const quoteStaff = await db.user.findUniqueOrThrow({ where: { email: "staff@example.co.bw" } });
  const staffActor = { userId: quoteStaff.id, name: quoteStaff.name, staffRole: "ADMIN" as const };
  const support = await db.product.findUniqueOrThrow({ where: { slug: "managed-support" } });
  await saveQuote({ db, staff: staffActor }, asked.reference, {
    market: "bw",
    productId: support.id,
    message: "Thanks for the call, Neo. This covers both depots, with two visits a month to Francistown.",
    validUntil: addDays(today, 21).toISOString().slice(0, 10),
    lines: [
      { kind: "MONTHLY", description: "Managed support, Gaborone and Francistown", quantity: "1", unitPrice: "2400" },
      { kind: "MONTHLY", description: "Site visit to Francistown", quantity: "2", unitPrice: "650" },
      { kind: "ONE_OFF", description: "Setting up the Francistown depot", quantity: "1", unitPrice: "3500" },
    ],
  });
  await sendQuote({ db, staff: staffActor }, asked.reference);

  // A lead from Thapelo, the website's assistant, with its conversation.
  const chatToken = randomBytes(24).toString("base64url");
  await db.salesChat.create({
    data: {
      tokenHash: createHash("sha256").update(chatToken).digest("hex"),
      market: "bw",
      startedOn: "/bw",
      purgeAfter: addDays(today, 90),
      messages: {
        create: [
          { role: "USER", text: "We're a logistics company with 8 staff. What do you suggest for email?" },
          { role: "ASSISTANT", text: "Grow fits best: Microsoft 365 for 8 users, branded signatures and daily backup. Would you like to talk to someone about moving your email?", toolTrace: [{ tool: "list_products", input: {} }] },
          { role: "USER", text: "Yes please, someone should call me." },
          { role: "ASSISTANT", text: "You can leave your details in the form below and someone from our team will contact you.", toolTrace: [{ tool: "offer_contact", input: { reason: "person", summary: "8 staff, wants Microsoft 365 and help moving email" } }] },
        ],
      },
    },
  });
  await createLead(
    db,
    { code: "bw", supportEmail: "support@example.co.bw" },
    { name: "Kagiso Molefe", email: "kagiso@kgalelogistics.example", phone: "+267 71 000 000", company: "Kgale Logistics", need: "8 staff, wants Microsoft 365 and help moving email", consent: true, reason: "person" },
    { token: chatToken, ipAddress: null },
  );

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
