import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { money } from "../src/lib/domain/money";
import { BillingError, PAYMENT_METHODS } from "../src/server/billing/adapter";
import { WhmcsClient } from "../src/server/billing/whmcs/client";
import { WhmcsBillingAdapter } from "../src/server/billing/whmcs/whmcs-adapter";
import { assertWritesAllowed } from "../src/server/billing/whmcs/write-guard";
import { billingContract } from "./billing-contract";
import { FAKE_CREDENTIALS, SERVICE_PASSWORD, fakeWhmcs, type FakeWhmcsOptions } from "./fake-whmcs";

const fake = fakeWhmcs();
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? String(x) : x));

billingContract(
  "WHMCS adapter against the in-memory WHMCS",
  () => new WhmcsBillingAdapter(new WhmcsClient(FAKE_CREDENTIALS, fake.fetcher)),
  async () => ({
    productId: "1",
    otherProductId: "2",
    currency: "BWP",
    tld: ".co.bw",
    freshDomain: () => `contract-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.co.bw`,
    takenDomain: "mascom.co.bw",
    unsupportedDomain: "example.xyz",
    savesCards: false,
    domainsGoLive: false,
  }),
);

function setUp(options: FakeWhmcsOptions = {}, adapterOptions: ConstructorParameters<typeof WhmcsBillingAdapter>[1] = {}) {
  const w = fakeWhmcs(options);
  const adapter = new WhmcsBillingAdapter(new WhmcsClient(FAKE_CREDENTIALS, w.fetcher), adapterOptions);
  return { w, adapter };
}

async function withClient(currency = "BWP", options: FakeWhmcsOptions = {}) {
  const { w, adapter } = setUp(options);
  const { clientId } = await adapter.createClient({ companyName: "Tlokweng Dairy", firstName: "Lesego", lastName: "Phiri", email: `dairy${Math.random()}@example.co.bw`, country: "BW", currency });
  return { w, adapter, clientId, P: (minor: bigint) => money(minor, currency) };
}

describe("WHMCS transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("treats bad credentials, IP or permissions as not connected", async () => {
    for (const message of ["Authentication Failed", "Invalid IP 203.0.113.9", "Invalid Permissions: API action \"GetInvoices\" is not allowed"]) {
      const { adapter } = setUp({ failWith: message });
      await expect(adapter.listProducts()).rejects.toMatchObject({ code: "not-connected" });
    }
  });

  it("tries a read once more when the network drops, but never a write", async () => {
    const read = setUp({ dropFirst: 1 });
    expect((await read.adapter.listProducts()).length).toBeGreaterThan(0);
    const w = fakeWhmcs({ dropFirst: 1 });
    const client = new WhmcsClient(FAKE_CREDENTIALS, w.fetcher);
    await expect(client.call("AddClient", { firstname: "A", lastname: "B", email: "a@example.co.bw", address1: "x", city: "x", state: "x", postcode: "0", country: "BW", phonenumber: "0" })).rejects.toMatchObject({ code: "not-connected" });
    expect(w.clients.size).toBe(0);
  });

  it("refuses an answer that isn't JSON", async () => {
    const client = new WhmcsClient(FAKE_CREDENTIALS, (async () => new Response("<html>maintenance</html>", { status: 200 })) as typeof fetch);
    await expect(client.call("GetCurrencies", {}, { read: true })).rejects.toMatchObject({ code: "not-connected" });
  });

  it("never logs a service password", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));
    const { adapter, clientId, P } = await withClient();
    const placed = await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "3", quantity: 1, billingCycle: "monthly", recurringPrice: P(85000n) }] });
    const service = await adapter.getService(clientId, placed.serviceIds[0]);
    expect(show(service)).not.toContain(SERVICE_PASSWORD);
    await expect(adapter.runModuleAction("999999", "suspend")).rejects.toBeInstanceOf(BillingError);
    for (const spy of spies) for (const args of spy.mock.calls) expect(show(args)).not.toContain(SERVICE_PASSWORD);
  });
});

describe("WHMCS adapter", () => {
  it("puts the number of users in the Users option and sends our price", async () => {
    const { w, adapter, clientId, P } = await withClient();
    await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "1", quantity: 7, billingCycle: "monthly", recurringPrice: P(133000n) }] });
    const order = w.calls.find((c) => c.action === "AddOrder")!.params;
    expect(order).toMatchObject({ "pid[0]": "1", "qty[0]": "1", "priceoverride[0]": "1330.00" });
    expect(Buffer.from(order["configoptions[0]"], "base64").toString()).toBe('a:1:{i:101;s:1:"7";}');
    expect((await adapter.listServices(clientId))[0]).toMatchObject({ quantity: 7, recurring: P(133000n), details: {} });
  });

  it("finds the client's currency from its WHMCS id when there is no code", async () => {
    const { w, clientId } = await withClient("ZAR");
    const fresh = new WhmcsBillingAdapter(new WhmcsClient(FAKE_CREDENTIALS, (async (url: string, init: RequestInit) => {
      const res = await w.fetcher(url, init);
      const body = await res.json();
      if (body.client) delete body.client.currency_code;
      return new Response(JSON.stringify(body));
    }) as typeof fetch));
    expect((await fresh.getClient(clientId))?.currency).toBe("ZAR");
  });

  it("refuses a currency WHMCS doesn't have", async () => {
    const { adapter } = setUp();
    await expect(adapter.createClient({ companyName: "X", firstName: "A", lastName: "B", email: "a@example.co.bw", country: "BW", currency: "EUR" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("activates a service without a module on accept, and uses the module when there is one", async () => {
    const { w, adapter, clientId, P } = await withClient();
    const placed = await adapter.placeOrder(clientId, {
      paymentMethod: PAYMENT_METHODS.eft,
      createInvoice: true,
      items: [
        { productId: "1", quantity: 2, billingCycle: "monthly", recurringPrice: P(38000n) },
        { productId: "3", quantity: 1, billingCycle: "monthly", recurringPrice: P(85000n) },
      ],
    });
    await adapter.acceptOrder(placed.orderId);
    expect((await adapter.listServices(clientId)).map((s) => s.status)).toEqual(["active", "active"]);
    expect(w.calls.find((c) => c.action === "AcceptOrder")!.params).toMatchObject({ autosetup: "true", sendemail: "0", sendregistrar: "0" });
    const statusChanges = w.calls.filter((c) => c.action === "UpdateClientProduct").map((c) => c.params.serviceid);
    expect(statusChanges).toEqual([placed.serviceIds[0]]);
  });

  it("sends domain orders to the registrar only when told to (production)", async () => {
    const { w, adapter } = setUp({}, { sendToRegistrar: true });
    const { clientId } = await adapter.createClient({ companyName: "X", firstName: "A", lastName: "B", email: "reg@example.co.bw", country: "BW", currency: "BWP" });
    const placed = await adapter.registerDomain(clientId, { name: "freshname.co.bw", years: 1, price: money(25000n, "BWP"), paymentMethod: PAYMENT_METHODS.eft });
    await adapter.acceptOrder(placed.orderId);
    expect(w.calls.find((c) => c.action === "AcceptOrder")!.params.sendregistrar).toBe("true");
    expect((await adapter.listDomains(clientId))[0].status).toBe("active");
  });

  it("changes the status itself for a product with no module, but shows a real module failure", async () => {
    const { adapter, clientId, P } = await withClient();
    const licence = await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "1", quantity: 2, billingCycle: "monthly", recurringPrice: P(38000n) }] });
    await adapter.acceptOrder(licence.orderId);
    await adapter.runModuleAction(licence.serviceIds[0], "suspend", "Asked by customer");
    expect(await adapter.getService(clientId, licence.serviceIds[0])).toMatchObject({ status: "suspended", suspendReason: "Asked by customer" });

    const broken = await withClient("BWP", { moduleFailure: "Connection to the VPS host timed out" });
    const vps = await broken.adapter.placeOrder(broken.clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "3", quantity: 1, billingCycle: "monthly", recurringPrice: broken.P(85000n) }] });
    await broken.adapter.acceptOrder(vps.orderId);
    await expect(broken.adapter.runModuleAction(vps.serviceIds[0], "terminate")).rejects.toThrow(/timed out/);
    expect((await broken.adapter.getService(broken.clientId, vps.serviceIds[0]))?.status).not.toBe("terminated");
  });

  it("cancels the order's services and invoice itself, since CancelOrder doesn't say it does", async () => {
    const { w, adapter, clientId, P } = await withClient();
    const placed = await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "1", quantity: 2, billingCycle: "monthly", recurringPrice: P(38000n) }] });
    await adapter.cancelOrder(placed.orderId);
    expect(w.calls.map((c) => c.action).slice(-5)).toEqual(["CancelOrder", "GetClientsProducts", "UpdateClientProduct", "GetInvoice", "UpdateInvoice"]);
    await expect(adapter.cancelOrder("424242")).rejects.toMatchObject({ code: "not-found" });
  });

  it("previews a seat change with WHMCS's own part-month charge, then sets users and price at once and bills it on a plain invoice", async () => {
    const { w, adapter, clientId, P } = await withClient();
    const placed = await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "1", quantity: 3, billingCycle: "monthly", recurringPrice: P(57000n) }] });
    await adapter.acceptOrder(placed.orderId);
    const id = placed.serviceIds[0];
    const preview = await adapter.previewUpgrade(id, { quantity: 5, recurringPrice: P(95000n) });
    // The live install gives no days for a configoptions change, so they come from the service's period.
    expect(preview).toMatchObject({ currentRecurring: P(57000n), newRecurring: P(95000n), dueNow: P(19000n) });
    expect(preview.daysLeft).toBeLessThanOrEqual(preview.daysInPeriod);
    expect(w.calls.at(-1)).toMatchObject({ action: "UpgradeProduct", params: { calconly: "true", type: "configoptions", "configoptions[101]": "5" } });

    const done = await adapter.upgradeService(id, { quantity: 5, recurringPrice: P(95000n) }, PAYMENT_METHODS.eft);
    expect(done.invoiceId).toBeDefined();
    expect(await adapter.getService(clientId, id)).toMatchObject({ quantity: 5, recurring: P(95000n) });
    // No WHMCS upgrade order: paying one would add to the recurring price.
    expect(w.calls.filter((c) => c.action === "UpgradeProduct" && !c.params.calconly)).toEqual([]);
    const created = w.calls.find((c) => c.action === "CreateInvoice")!;
    expect(created.params).toMatchObject({ userid: clientId, itemamount1: "190.00", sendinvoice: "0" });

    // A price-only change raises no WHMCS order.
    const priceOnly = await adapter.upgradeService(id, { recurringPrice: P(90000n) }, PAYMENT_METHODS.eft);
    expect(priceOnly.invoiceId).toBeUndefined();
    expect((await adapter.getService(clientId, id))?.recurring).toEqual(P(90000n));
  });

  it("checks a domain against every client in WHMCS, not only whois", async () => {
    const { adapter, clientId } = await withClient();
    await adapter.registerDomain(clientId, { name: "held.co.bw", years: 1, price: money(25000n, "BWP"), paymentMethod: PAYMENT_METHODS.eft });
    expect(await adapter.checkDomain("Held.co.bw")).toEqual({ name: "held.co.bw", supported: true, available: false });
    expect(await adapter.checkDomain("free.co.bw")).toEqual({ name: "free.co.bw", supported: true, available: true });
    await expect(adapter.checkDomain("a.b.co.bw")).rejects.toMatchObject({ code: "invalid" });
  });

  it("reads TLD prices in the currency asked for", async () => {
    const { adapter } = setUp();
    const zar = await adapter.getTldPricing("ZAR");
    expect(zar.find((t) => t.tld === ".co.bw")).toEqual({ tld: ".co.bw", register: money(30000n, "ZAR"), renew: money(30000n, "ZAR"), transfer: money(30000n, "ZAR") });
  });

  it("clears a purchase order number from the notes", async () => {
    const { adapter, clientId, P } = await withClient();
    const { invoiceId } = await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "3", quantity: 1, billingCycle: "monthly", recurringPrice: P(85000n) }] });
    await adapter.setPurchaseOrder(invoiceId!, "4471");
    await adapter.setPurchaseOrder(invoiceId!, null);
    expect((await adapter.getInvoice(clientId, invoiceId!))?.notes).toBeUndefined();
  });

  it("pages through long lists", async () => {
    const { w, adapter, clientId, P } = await withClient();
    for (let i = 0; i < 3; i++) await adapter.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: "3", quantity: 1, billingCycle: "monthly", recurringPrice: P(85000n) }] });
    expect(await adapter.listInvoices(clientId)).toHaveLength(3);
    expect(w.calls.filter((c) => c.action === "GetInvoices").every((c) => c.params.limitnum === "250" && c.params.userid === clientId)).toBe(true);
  });
});

describe("WHMCS write tests guard", () => {
  it("refuses whenever WHMCS_ENVIRONMENT is production", () => {
    expect(() => assertWritesAllowed({ WHMCS_ENVIRONMENT: "production" })).toThrow(/Refusing to run the WHMCS write tests/);
    expect(() => assertWritesAllowed({ WHMCS_ENVIRONMENT: " Production " })).toThrow();
    expect(() => assertWritesAllowed({ WHMCS_ENVIRONMENT: "test" })).not.toThrow();
    expect(() => assertWritesAllowed({})).not.toThrow();
  });

  it("stops the whole write suite before it touches WHMCS", async () => {
    const run = promisify(execFile);
    const env = { ...process.env, WHMCS_API_URL: "https://127.0.0.1:9/includes/api.php", WHMCS_API_IDENTIFIER: "x", WHMCS_API_SECRET: "x", WHMCS_TEST_WRITES: "yes", WHMCS_ENVIRONMENT: "production" };
    const failed = await run("npx", ["vitest", "run", "tests/whmcs.integration.test.ts"], { env, timeout: 90_000 }).then(
      () => null,
      (err: { code?: number; stdout?: string; stderr?: string }) => err,
    );
    expect(failed?.code).toBe(1);
    expect(`${failed?.stdout}${failed?.stderr}`).toMatch(/Refusing to run the WHMCS write tests: WHMCS_ENVIRONMENT is production/);
  }, 120_000);
});
