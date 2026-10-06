import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { money } from "../src/lib/domain/money";
import { monthOf } from "../src/lib/domain/pricing";
import { useBillingAdapter } from "../src/server/billing";
import { emailNewInvoices } from "../src/server/billing/invoice-emails";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { buildCompanyPush, pushCompany } from "../src/server/billing/whmcs/company-push";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { bankFor, companyDetails, saveBankAccount, saveCompany, saveLogo } from "../src/server/company/company";
import { useRegistrarFactory } from "../src/server/domains/active";
import { changeNameservers, domainPanel, renewDomain, saveDns, transferDomainIn, transferOutCode } from "../src/server/domains/manage";
import { runDomainOperations } from "../src/server/domains/operations";
import type { Availability, DnsRecord, Registrar, RegistrarContact, RegistrarDomain, RegistrarKey } from "../src/server/domains/registrar";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { deliverDue } from "../src/server/email/outbox";
import { featureOn, setFeature } from "../src/server/features/features";
import { partnerSummary, savePartner, setPartnerEnabled, testPartner } from "../src/server/partners/partners";
import { registerDomain, type OrderDeps } from "../src/server/orders/orders";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

// The partner vault's key comes from TOTP_ENCRYPTION_KEY, which the check job doesn't set.
const TOTP = process.env.TOTP_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
});
afterAll(() => {
  if (TOTP === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = TOTP;
});

/** A registrar in memory: names it holds are taken; it can be told to fail. */
class FakeRegistrar implements Registrar {
  domains = new Map<string, RegistrarDomain>();
  dns = new Map<string, DnsRecord[]>();
  contact: RegistrarContact | null = { firstName: "Neo", lastName: "Kgosi", email: "neo@example.co.bw", phone: "+267 390 0000", address: "Plot 1", city: "Gaborone", country: "BW" };
  failRegister = false;
  constructor(
    readonly key: RegistrarKey,
    own = false,
  ) {
    if (own) {
      this.register = async (name, years) => {
        if (this.failRegister) throw new Error("The registry refused the name.");
        const expiresOn = new Date(Date.UTC(2026 + years, 0, 1));
        this.domains.set(name, { name, status: "active", expiresOn, nameservers: [] });
        return { expiresOn };
      };
    }
  }
  register?: Registrar["register"];
  async test() {
    return "Signed in to the fake.";
  }
  async check(names: string[]): Promise<Availability[]> {
    return names.map((n) => ({ name: n, available: !this.domains.has(n) }));
  }
  async info(name: string) {
    return this.domains.get(name) ?? null;
  }
  async setNameservers(name: string, nameservers: string[]) {
    this.domains.set(name, { ...this.domains.get(name)!, nameservers });
  }
  async getContact() {
    return this.contact;
  }
  async updateContact(_name: string, contact: RegistrarContact) {
    this.contact = contact;
  }
  async authCode() {
    return "Ab#12345";
  }
  async dnsRecords(name: string) {
    return this.dns.get(name) ?? null;
  }
  async saveDnsRecords(name: string, records: DnsRecord[]) {
    this.dns.set(name, records);
  }
}

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Kagiso Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

const FEATURE_KEYS = ["openprovider-domains", "bw-registry-domains", "branded-pdfs", "invoice-emails"];
const month = monthOf(new Date());

describe.skipIf(!hasDb)("strategy U1", () => {
  let admin: StaffActor;
  const openprovider = new FakeRegistrar("openprovider");
  const bwRegistry = new FakeRegistrar("bw-registry", true);
  let savedCompany: unknown;

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    admin = await staff("ADMIN");
    savedCompany = await db.companyProfile.findUnique({ where: { id: "company" } });
  });

  afterAll(async () => {
    useRegistrarFactory(undefined);
    useBillingAdapter(undefined);
    await db.featureSwitch.deleteMany({ where: { key: { in: FEATURE_KEYS } } });
    await db.partnerSetting.deleteMany({ where: { key: { in: ["openprovider", "bw-registry"] } } });
    await db.bankAccount.deleteMany({ where: { marketCode: "u1x" } });
    await db.marketChange.deleteMany({ where: { marketCode: "u1x" } });
    await db.market.deleteMany({ where: { code: "u1x" } });
    if (!savedCompany) await db.companyProfile.deleteMany({ where: { id: "company" } });
  });

  describe("Admin > Features", () => {
    it("is off until an Admin turns it on, and every change is audited", async () => {
      const support = await staff("SUPPORT");
      expect(await featureOn(db, "branded-pdfs")).toBe(false);
      await expect(setFeature({ db, staff: support }, "branded-pdfs", true)).rejects.toMatchObject({ code: "forbidden" });
      await setFeature({ db, staff: admin }, "branded-pdfs", true);
      expect(await featureOn(db, "branded-pdfs")).toBe(true);
      const entry = await db.staffAuditEvent.findFirstOrThrow({ where: { actorUserId: admin.userId, action: "feature.on" }, orderBy: { createdAt: "desc" } });
      expect(entry.summary).toBe("Turned on Invoice and quote PDFs");
      await setFeature({ db, staff: admin }, "branded-pdfs", false);
      expect(await featureOn(db, "branded-pdfs")).toBe(false);
    });

    it("won't turn on Openprovider domains before the partner is on", async () => {
      await db.partnerSetting.deleteMany({ where: { key: "openprovider" } });
      await expect(setFeature({ db, staff: admin }, "openprovider-domains", true)).rejects.toMatchObject({ code: "conflict" });
    });
  });

  describe("Admin > Partners", () => {
    it("keeps credentials sealed, needs a passing test, and switches the feature off with the partner", async () => {
      await expect(savePartner({ db, staff: await staff("SUPPORT") }, "openprovider", { username: "u", password: "p" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(savePartner({ db, staff: admin }, "openprovider", { username: "fgt-api", password: "" })).rejects.toMatchObject({ fieldErrors: { password: expect.any(String) } });
      await savePartner({ db, staff: admin }, "openprovider", { username: "fgt-api", password: "s3cret-pass", environment: "sandbox", nameservers: "ns1.openprovider.nl\nns2.openprovider.be" });
      const row = await db.partnerSetting.findUniqueOrThrow({ where: { key: "openprovider" } });
      expect(row.secrets).not.toContain("s3cret-pass");
      const summary = await partnerSummary(db, "openprovider");
      expect(JSON.stringify(summary)).not.toContain("s3cret-pass");
      expect(summary.secretsSet).toEqual({ password: true });

      // A blank password keeps the saved one.
      await savePartner({ db, staff: admin }, "openprovider", { username: "fgt-api", password: "", environment: "sandbox", nameservers: "ns1.openprovider.nl\nns2.openprovider.be" });
      expect((await partnerSummary(db, "openprovider")).secretsSet).toEqual({ password: true });

      await expect(setPartnerEnabled({ db, staff: admin }, "openprovider", true)).rejects.toMatchObject({ code: "conflict" });
      const failing = new FakeRegistrar("openprovider");
      failing.test = async () => {
        throw new Error("refused");
      };
      expect((await testPartner({ db, staff: admin, build: () => failing }, "openprovider")).ok).toBe(false);
      expect(await testPartner({ db, staff: admin, build: () => openprovider }, "openprovider")).toEqual({ ok: true, message: "Signed in to the fake." });
      await setPartnerEnabled({ db, staff: admin }, "openprovider", true);
      await setFeature({ db, staff: admin }, "openprovider-domains", true);
      expect(await featureOn(db, "openprovider-domains")).toBe(true);

      // New credentials need a new test: the partner and its feature go off.
      await savePartner({ db, staff: admin }, "openprovider", { username: "fgt-api", password: "new-pass", environment: "sandbox", nameservers: "ns1.openprovider.nl\nns2.openprovider.be" });
      expect((await partnerSummary(db, "openprovider")).enabled).toBe(false);
      await setPartnerEnabled({ db, staff: admin }, "openprovider", false);
      expect(await featureOn(db, "openprovider-domains")).toBe(false);
      const actions = (await db.staffAuditEvent.findMany({ where: { actorUserId: admin.userId, action: { startsWith: "partner." } } })).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(["partner.saved", "partner.tested", "partner.on"]));
    });
  });

  describe("Admin > Company", () => {
    it("starts from the values the platform had and audits each change", async () => {
      await db.companyProfile.deleteMany({ where: { id: "company" } });
      const before = await companyDetails(db);
      expect(before).toMatchObject({ legalName: "Fourth Generation Technologies (Pty) Ltd", registrationNumber: "BW00001816431" });
      expect(before.addressLines[0]).toBe("Plot 27860, Block 3");
      await expect(saveCompany({ db, staff: admin }, { ...input(before), email: "nope" })).rejects.toMatchObject({ fieldErrors: { email: expect.any(String) } });
      const changed = await saveCompany({ db, staff: admin }, { ...input(before), phone: "+267 390 0000" });
      expect(changed).toEqual(["Phone"]);
      const entry = await db.staffAuditEvent.findFirstOrThrow({ where: { actorUserId: admin.userId, action: "company.saved" }, orderBy: { createdAt: "desc" } });
      expect(entry.data).toMatchObject({ changes: { phone: { to: "+267 390 0000" } } });
      expect(await saveCompany({ db, staff: admin }, { ...input(before), phone: "+267 390 0000" })).toEqual([]);
    });

    it("only takes a logo that is a wide PNG", async () => {
      await expect(saveLogo({ db, staff: admin }, "light", Buffer.from("GIF89a"))).rejects.toMatchObject({ field: "logo-light" });
      const narrow = Buffer.alloc(32);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(narrow);
      narrow.write("IHDR", 12, "ascii");
      narrow.writeUInt32BE(100, 16);
      narrow.writeUInt32BE(100, 20);
      await expect(saveLogo({ db, staff: admin }, "light", narrow)).rejects.toMatchObject({ field: "logo-light" });
    });

    it("keeps bank details per market and currency, and the market's own currency in step", async () => {
      const bw = await db.market.findUniqueOrThrow({ where: { code: "bw" } });
      const { code: _code, updatedAt: _u, ...rest } = bw;
      await db.market.create({ data: { ...rest, code: "u1x", name: "U1 test", countries: [], isDefault: false, enabled: false, currency: "BWP", paymentMethods: ["eft"], eftBankName: null, eftAccountName: null, eftAccountNumber: null } as never });
      const market = await db.market.findUniqueOrThrow({ where: { code: "u1x" } });
      expect(await bankFor(db, market)).toBeNull();
      await expect(saveBankAccount({ db, staff: admin }, { marketCode: "u1x", currency: "BWP", bankName: "FNB", branchName: "", accountName: "Fourth Generation", accountNumber: "620000", branchCode: "", swiftCode: "BAD" })).rejects.toMatchObject({
        fieldErrors: { swiftCode: expect.any(String) },
      });
      await saveBankAccount({ db, staff: admin }, { marketCode: "u1x", currency: "BWP", bankName: "First National Bank", branchName: "Mall", accountName: "Fourth Generation", accountNumber: "62000000000", branchCode: "281467", swiftCode: "FIRNBWGX" });
      await saveBankAccount({ db, staff: admin }, { marketCode: "u1x", currency: "usd", bankName: "Stanbic", branchName: "", accountName: "Fourth Generation", accountNumber: "9000", branchCode: "", swiftCode: "" });
      const after = await db.market.findUniqueOrThrow({ where: { code: "u1x" } });
      expect(after).toMatchObject({ eftBankName: "First National Bank", eftAccountNumber: "62000000000", eftSwiftCode: "FIRNBWGX" });
      expect(await bankFor(db, after)).toMatchObject({ bankName: "First National Bank", branchName: "Mall", accountNumber: "62000000000" });
      expect(await bankFor(db, after, "USD")).toMatchObject({ bankName: "Stanbic", accountNumber: "9000", currency: "USD" });
      expect(await db.marketChange.count({ where: { marketCode: "u1x", field: "eftAccountNumber" } })).toBe(1);
    });
  });

  describe("domains through a registrar", () => {
    async function setUp(name: string) {
      const org = await makeOrganisation(name);
      const stub = new StubBillingAdapter(db);
      const billing = await scopedBilling(db, stub, org.organisationId);
      const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
      const deps: OrderDeps = { db: org.tenant, billing, organisation, actor: org.owner };
      const clientId = (await db.billingAccount.findUniqueOrThrow({ where: { organisationId: org.organisationId } })).externalClientId;
      return { ...org, stub, billing, deps, clientId };
    }
    async function pay(stub: StubBillingAdapter, clientId: string, invoiceId: string) {
      const invoice = (await stub.getInvoice(clientId, invoiceId))!;
      await stub.recordPayment(invoiceId, { amount: invoice.balance, gateway: "banktransfer", reference: invoice.number, paidAt: new Date() });
    }
    const run = (stub: StubBillingAdapter, now = new Date()) => runDomainOperations({ db, adapter: stub, now, registrarFor: async (key) => (key === "openprovider" ? openprovider : bwRegistry) });

    beforeAll(async () => {
      useRegistrarFactory((key) => (key === "openprovider" ? openprovider : bwRegistry));
      await db.partnerSetting.upsert({ where: { key: "openprovider" }, create: { key: "openprovider", enabled: true, secrets: "" }, update: { enabled: true, lastTestOk: true } });
      await db.featureSwitch.upsert({ where: { key: "openprovider-domains" }, create: { key: "openprovider-domains", enabled: true }, update: { enabled: true } });
    });

    it("registers a paid .com through WHMCS's registrar module and tells the customer", async () => {
      const o = await setUp("Kgale Hill Bakery");
      const name = `kgale${Date.now().toString(36)}.com`;
      const order = await registerDomain(o.deps, name, "1", true);
      const op = await db.domainOperation.findFirstOrThrow({ where: { orderId: order.id } });
      expect(op).toMatchObject({ kind: "REGISTER", registrar: "openprovider", status: "WAITING_PAYMENT" });
      // No staff task: it is automatic.
      expect(await db.provisioningTask.count({ where: { orderId: order.id } })).toBe(0);

      expect(await run(o.stub)).toBeGreaterThanOrEqual(0);
      expect((await db.domainOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("WAITING_PAYMENT");

      await pay(o.stub, o.clientId, order.billingInvoiceId!);
      await run(o.stub);
      expect((await db.domainOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("SUBMITTED");
      // WHMCS's module registered it: the billing record went active on acceptance.
      await run(o.stub);
      expect((await db.domainOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("DONE");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ACTIVE");
      expect(await db.outboundEmail.count({ where: { organisationId: o.organisationId, kind: "order.ready" } })).toBe(1);
      expect(await db.auditEvent.count({ where: { organisationId: o.organisationId, action: "domain.registered" } })).toBe(1);
    });

    it("lets the customer manage the domain, every change audited", async () => {
      const o = await setUp("Tlokweng Tiles");
      const name = `tiles${Date.now().toString(36)}.com`;
      const order = await registerDomain(o.deps, name, "1", true);
      await pay(o.stub, o.clientId, order.billingInvoiceId!);
      await run(o.stub);
      await run(o.stub);
      const domain = (await o.billing.listDomains()).find((d) => d.name === name)!;
      openprovider.domains.set(name, { name, status: "active", expiresOn: domain.expiresOn, nameservers: ["ns1.openprovider.nl"] });

      const panel = await domainPanel(o.deps, domain.domainId);
      expect(panel).toMatchObject({ managed: true, nameservers: ["ns1.openprovider.nl"], dns: { supported: true, records: null } });

      await changeNameservers(o.deps, domain.domainId, "ns1.example.com\nns2.example.com");
      expect(openprovider.domains.get(name)?.nameservers).toEqual(["ns1.example.com", "ns2.example.com"]);
      await saveDns(o.deps, domain.domainId, [{ type: "A", name: "", value: "203.0.113.10", ttl: 3600 }]);
      expect(openprovider.dns.get(name)).toHaveLength(1);
      expect(await transferOutCode(o.deps, domain.domainId)).toBe("Ab#12345");
      const actions = (await db.auditEvent.findMany({ where: { organisationId: o.organisationId, targetType: "Domain" } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["domain.nameservers", "domain.dns", "domain.transfer_code"]));

      const placed = await renewDomain(o.deps, domain.domainId, "2");
      const renewal = await db.domainOperation.findFirstOrThrow({ where: { domain: name, kind: "RENEW" } });
      expect(renewal).toMatchObject({ status: "WAITING_PAYMENT", years: 2, previousExpiry: domain.expiresOn });
      await expect(renewDomain(o.deps, domain.domainId, "1")).rejects.toMatchObject({ code: "conflict" });
      if (placed.invoiceId) await pay(o.stub, o.clientId, placed.invoiceId);
      await run(o.stub);
      openprovider.domains.set(name, { ...openprovider.domains.get(name)!, expiresOn: new Date(domain.expiresOn.getTime() + 2 * 365 * 86_400_000) });
      await run(o.stub);
      expect((await db.domainOperation.findUniqueOrThrow({ where: { id: renewal.id } })).status).toBe("DONE");
    });

    it("takes a transfer in with its code, priced at a year's renewal", async () => {
      const o = await setUp("Gabane Glass");
      // A name that is already registered elsewhere, as a transfer needs.
      const name = "debswana.com";
      await db.stubDomain.deleteMany({ where: { domain: name } });
      await expect(transferDomainIn(o.deps, name, "", true)).rejects.toMatchObject({ field: "authCode" });
      const order = await transferDomainIn(o.deps, name, "EPP-CODE-1", true);
      expect(order.unitPriceMinor).toBeGreaterThan(0n);
      const op = await db.domainOperation.findFirstOrThrow({ where: { orderId: order.id } });
      // WHMCS's module keeps the code with its own order; we keep none.
      expect(op).toMatchObject({ kind: "TRANSFER", authCodeSealed: null });
    });

    it("gives staff a task when a registration keeps failing", async () => {
      const o = await setUp("Ramotswa Rides");
      const name = `rides${Date.now().toString(36)}.co.bw`;
      const placed = await o.billing.registerDomain({ name, years: 1, price: money(10000n, "BWP"), paymentMethod: "banktransfer" });
      const op = await db.domainOperation.create({
        data: { organisationId: o.organisationId, kind: "REGISTER", domain: name, years: 1, registrar: "bw-registry", billingOrderId: placed.orderId, billingInvoiceId: placed.invoiceId ?? null, billingDomainId: placed.domainIds[0] ?? null },
      });
      await pay(o.stub, o.clientId, placed.invoiceId!);
      bwRegistry.failRegister = true;
      for (let i = 0; i < 3; i++) await run(o.stub);
      bwRegistry.failRegister = false;
      const failed = await db.domainOperation.findUniqueOrThrow({ where: { id: op.id } });
      expect(failed).toMatchObject({ status: "FAILED", lastError: "The registry refused the name." });
      const task = await db.provisioningTask.findUniqueOrThrow({ where: { id: failed.taskId! } });
      expect(task.title).toBe(`Register ${name}: finish by hand`);
      expect(task.instructions).toContain("the .bw registry");
    });

    it("registers .bw itself once the registry adapter is on", async () => {
      const o = await setUp("Lobatse Leather");
      const name = `leather${Date.now().toString(36)}.co.bw`;
      const placed = await o.billing.registerDomain({ name, years: 2, price: money(20000n, "BWP"), paymentMethod: "banktransfer" });
      const op = await db.domainOperation.create({
        data: { organisationId: o.organisationId, kind: "REGISTER", domain: name, years: 2, registrar: "bw-registry", billingOrderId: placed.orderId, billingInvoiceId: placed.invoiceId ?? null, billingDomainId: placed.domainIds[0] ?? null },
      });
      await pay(o.stub, o.clientId, placed.invoiceId!);
      await run(o.stub);
      expect((await db.domainOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("DONE");
      const domain = (await o.billing.listDomains()).find((d) => d.name === name)!;
      expect(domain.status).toBe("active");
      expect(domain.expiresOn.toISOString().slice(0, 10)).toBe("2028-01-01");
    });
  });

  describe("invoice emails", () => {
    it("emails each new invoice once, with the branded PDF", async () => {
      const org = await makeOrganisation("Palapye Paints");
      const stub = new StubBillingAdapter(db);
      useBillingAdapter(stub);
      await scopedBilling(db, stub, org.organisationId);
      const clientId = (await db.billingAccount.findUniqueOrThrow({ where: { organisationId: org.organisationId } })).externalClientId;
      expect(await emailNewInvoices({ db, adapter: stub })).toBe(0);

      await db.featureSwitch.upsert({ where: { key: "invoice-emails" }, create: { key: "invoice-emails", enabled: true }, update: { enabled: true } });
      const due = new Date(Date.now() + 14 * 86_400_000);
      const { invoiceId } = await stub.createInvoice(clientId, { lines: [{ description: "Managed VPS, medium", amount: money(85000n, "BWP"), taxed: true }], paymentMethod: "banktransfer", dueOn: due });
      const first = await emailNewInvoices({ db, adapter: stub });
      expect(first).toBeGreaterThanOrEqual(1);
      expect(await emailNewInvoices({ db, adapter: stub })).toBe(0);

      const adapter = new MemoryEmailAdapter();
      await deliverDue(db, adapter, new Date(), 50, { toAddress: org.email });
      const message = adapter.sent.find((m) => m.to === org.email && m.subject.startsWith("Invoice"))!;
      expect(message.subject).toMatch(/^Invoice INV-\d{4}-\d+ from Fourth Generation Technologies: /);
      expect(message.attachments?.[0]).toMatchObject({ contentType: "application/pdf", filename: expect.stringMatching(/\.pdf$/) });
      expect(message.attachments?.[0].content.subarray(0, 5).toString()).toBe("%PDF-");
      expect(message.text).toContain(`/app/billing/invoices/${invoiceId}`);
      expect(message.text).toContain("BW00001816431");
    });
  });

  describe("company details into WHMCS", () => {
    it("sends a signed push and audits what changed", async () => {
      await db.partnerSetting.updateMany({ where: { key: "openprovider" }, data: { enabled: false } });
      const request = await buildCompanyPush(db, { appUrl: "https://console.example.co.bw", mailFrom: "Fourth Generation Technologies <billing@example.co.bw>" });
      expect(request.settings).toMatchObject({ CompanyName: "Fourth Generation Technologies (Pty) Ltd", MaintenanceMode: "on", MaintenanceModeURL: "https://console.example.co.bw/app", SystemEmailsFromEmail: "billing@example.co.bw", Template: "fourthgen" });
      expect(request.settings.InvoicePayTo).toContain("BW00001816431");
      expect(request.emailTemplates.map((t) => t.name)).toContain("Invoice Created");
      expect(request.currencies.map((c) => c.code)).toContain("BWP");
      // Openprovider is off here, so its password isn't sent.
      expect(request.registrar).toBeUndefined();

      const secret = "a".repeat(64);
      let seen: { headers: Record<string, string>; body: string } | undefined;
      const fetcher = (async (_url: string, init: RequestInit) => {
        seen = { headers: init.headers as Record<string, string>, body: String(init.body) };
        return new Response(JSON.stringify({ ok: true, changes: ["set CompanyName to Fourth Generation Technologies (Pty) Ltd"], warnings: [] }));
      }) as typeof fetch;
      const result = await pushCompany({ db, url: "https://billing.example/company.php", secret, appUrl: "https://console.example.co.bw", mailFrom: "x <billing@example.co.bw>", fetcher }, admin, { apply: true });
      expect(result.changes).toHaveLength(1);
      const h = seen!.headers;
      const expected = `v1=${createHmac("sha256", secret).update(`v1\n${h["x-console-timestamp"]}\n${h["x-console-request-id"]}\n${seen!.body}`).digest("hex")}`;
      expect(h["x-console-signature"]).toBe(expected);
      expect(JSON.parse(seen!.body).dryRun).toBe(false);
      expect(await db.staffAuditEvent.count({ where: { actorUserId: admin.userId, action: "whmcs.company-push" } })).toBe(1);
      await db.partnerSetting.updateMany({ where: { key: "openprovider" }, data: { enabled: true } });
      expect((await buildCompanyPush(db, { appUrl: "https://console.example.co.bw", mailFrom: "x" })).registrar).toMatchObject({ module: "openprovider", username: "fgt-api", testMode: true });
      await expect(pushCompany({ db, url: "x", secret, appUrl: "x", mailFrom: "x", fetcher }, await staff("SUPPORT"), { apply: true })).rejects.toMatchObject({ code: "forbidden" });
    });
  });
});

function input(c: Awaited<ReturnType<typeof companyDetails>>) {
  return {
    legalName: c.legalName,
    tradingName: c.tradingName,
    registrationNumber: c.registrationNumber,
    address: c.addressLines.join("\n"),
    phone: c.phone ?? "",
    email: c.email,
    website: c.website ?? "",
    invoiceFooter: c.invoiceFooter ?? "",
    paymentTerms: c.paymentTerms ?? "",
    quoteTerms: c.quoteTerms ?? "",
  };
}
