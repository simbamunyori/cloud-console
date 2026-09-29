/**
 * Checks against a real WHMCS. `npm run test:whmcs`.
 *
 * Skipped unless WHMCS_API_URL, WHMCS_API_IDENTIFIER and WHMCS_API_SECRET
 * are set. With only those, it reads: the connection, currencies,
 * products, domain pricing, every read action in the API role, and (with
 * WHMCS_SYNC_SECRET) that the sync addon accepts our signature.
 *
 * WHMCS_TEST_WRITES=yes also runs the full adapter contract, which creates
 * clients, orders, invoices and payments. It refuses to run at all when
 * WHMCS_ENVIRONMENT=production. See docs/whmcs-setup.md, section 9.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { money } from "../src/lib/domain/money";
import { PAYMENT_METHODS } from "../src/server/billing/adapter";
import { WhmcsClient, WhmcsRefusal } from "../src/server/billing/whmcs/client";
import * as map from "../src/server/billing/whmcs/map";
import { signSync, syncUrlFor } from "../src/server/billing/whmcs/price-sync";
import { WhmcsBillingAdapter } from "../src/server/billing/whmcs/whmcs-adapter";
import { assertWritesAllowed } from "../src/server/billing/whmcs/write-guard";
import { billingContract } from "./billing-contract";

const e = process.env;
const live = Boolean(e.WHMCS_API_URL && e.WHMCS_API_IDENTIFIER && e.WHMCS_API_SECRET);
const writes = live && e.WHMCS_TEST_WRITES === "yes";
// The hard guard: throws before any test is registered.
if (writes) assertWritesAllowed({ WHMCS_ENVIRONMENT: e.WHMCS_ENVIRONMENT });
// A live install answers in seconds per call, not the 5 s unit default.
vi.setConfig({ testTimeout: 60_000 });

const client = () => new WhmcsClient({ url: e.WHMCS_API_URL!, identifier: e.WHMCS_API_IDENTIFIER!, secret: e.WHMCS_API_SECRET!, accessKey: e.WHMCS_ACCESS_KEY || undefined });
const adapter = () => new WhmcsBillingAdapter(client(), { sendToRegistrar: false });

describe.skipIf(!live)("WHMCS, read only", () => {
  it("connects and finds BWP, ZAR and USD", async () => {
    const codes = map.fromCurrencies(await client().call("GetCurrencies", {}, { read: true })).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["BWP", "ZAR", "USD"]));
  });

  it("lists products and domain pricing", async () => {
    await adapter().listProducts();
    const tlds = await adapter().getTldPricing("BWP");
    for (const t of tlds) expect(t.register.currency).toBe("BWP");
  });

  it("is allowed every read action the console uses", async () => {
    // Ids that don't exist: WHMCS answers "not found", which proves the
    // permission. A missing permission is a connection problem instead.
    const reads: [string, Record<string, string>][] = [
      ["GetClientsDetails", { clientid: "999999999" }],
      ["GetClientsProducts", { clientid: "999999999" }],
      ["GetClientsDomains", { clientid: "999999999" }],
      ["GetOrders", { id: "999999999" }],
      ["GetInvoices", { userid: "999999999" }],
      ["GetInvoice", { invoiceid: "999999999" }],
      ["GetTransactions", { clientid: "999999999" }],
      ["GetPayMethods", { clientid: "999999999" }],
      ["GetProducts", {}],
      ["DomainWhois", { domain: "google.com" }],
    ];
    for (const [action, params] of reads) {
      try {
        await client().call(action, params, { read: true });
      } catch (err) {
        expect(err instanceof WhmcsRefusal && err.code !== "not-connected", `${action}: ${(err as Error).message}`).toBe(true);
      }
    }
  });

  it.skipIf(!e.WHMCS_SYNC_SECRET)("reaches the sync addon, which accepts our signature", async () => {
    // An empty list is refused as invalid, after the signature, time and
    // address checks have passed, so nothing changes.
    const body = JSON.stringify({ dryRun: true, operations: [] });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const requestId = randomBytes(16).toString("hex");
    const res = await fetch(e.WHMCS_SYNC_URL || syncUrlFor(e.WHMCS_API_URL!), {
      method: "POST",
      headers: { "content-type": "application/json", "x-console-timestamp": timestamp, "x-console-request-id": requestId, "x-console-signature": signSync(e.WHMCS_SYNC_SECRET!, timestamp, requestId, body) },
      body,
    });
    const answer = await res.json();
    expect({ status: res.status, error: answer.error }).toEqual({ status: 400, error: expect.stringContaining("operations must be") });
  });
});

describe.skipIf(!writes)("WHMCS, writing (test install only)", () => {
  /** Two products sold per user in BWP, and a domain ending we sell. */
  async function fixtures() {
    const products = map.productsList(await client().call("GetProducts", {}, { read: true }));
    const perUser = products.filter((p) => map.quantityOption(p) && map.fromProduct(p).prices.BWP);
    if (perUser.length < 2) throw new Error("Run npm run whmcs:sync -- --apply first: the write tests need two per-user products priced in BWP.");
    const tlds = (await adapter().getTldPricing("BWP")).map((t) => t.tld);
    const tld = tlds.includes(".co.bw") ? ".co.bw" : tlds[0];
    if (!tld) throw new Error("Run the price sync first: the write tests need a domain ending priced in BWP.");
    const unsupported = [".zzzz", ".xyz", ".example"].find((t) => !tlds.includes(t))!;
    return {
      productId: String(perUser[0].pid),
      otherProductId: String(perUser[1].pid),
      currency: "BWP",
      tld,
      freshDomain: () => `contract-${Date.now().toString(36)}${randomBytes(2).toString("hex")}${tld}`,
      takenDomain: tld === ".co.bw" ? "mascom.co.bw" : `google${tld}`,
      unsupportedDomain: `example${unsupported}`,
      savesCards: false,
      // No registrar is connected on the test install.
      domainsGoLive: false,
    };
  }

  billingContract("WHMCS test install", adapter, fixtures);

  it("keeps our recurring price after a seat change's invoice is paid", async () => {
    const a = adapter();
    const f = await fixtures();
    const P = (minor: bigint) => money(minor, "BWP");
    const { clientId } = await a.createClient({ companyName: "Seat Change Check", firstName: "Thato", lastName: "Mosweu", email: `seats-${randomBytes(4).toString("hex")}@example.co.bw`, country: "BW", currency: "BWP" });
    const placed = await a.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: f.productId, quantity: 3, billingCycle: "monthly", recurringPrice: P(57000n) }] });
    await a.acceptOrder(placed.orderId);
    // Paid up, so the seat change raises a part-month invoice (with the
    // first invoice unpaid, WHMCS raises none and nothing is checked).
    const first = (await a.getInvoice(clientId, placed.invoiceId!))!;
    await a.recordPayment(placed.invoiceId!, { amount: first.balance, gateway: PAYMENT_METHODS.eft, reference: `FIRST-${Date.now()}`, paidAt: new Date() });
    const done = await a.upgradeService(placed.serviceIds[0], { quantity: 5, recurringPrice: P(95000n) }, PAYMENT_METHODS.eft);
    expect(done.invoiceId).toBeDefined();
    const invoice = (await a.getInvoice(clientId, done.invoiceId!))!;
    await a.recordPayment(done.invoiceId!, { amount: invoice.balance, gateway: PAYMENT_METHODS.eft, reference: `CHECK-${Date.now()}`, paidAt: new Date() });
    expect(await a.getService(clientId, placed.serviceIds[0])).toMatchObject({ quantity: 5, recurring: P(95000n) });
  });
});
