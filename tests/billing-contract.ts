/**
 * What every BillingAdapter must do, written once and run against each
 * implementation: the stub now (billing-stub.test.ts), and WHMCS staging in
 * Phase 2. It only uses the interface, and never assumes a fixed date.
 */
import { describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import { type BillingAdapter, BillingError, PAYMENT_METHODS } from "../src/server/billing/adapter";

export interface ContractFixtures {
  /** Two products the engine sells in `currency`. */
  productId: string;
  otherProductId: string;
  currency: string;
  /** A new, unregistered name ending in `tld` each call. */
  freshDomain: () => string;
  tld: string;
  takenDomain: string;
  unsupportedDomain: string;
  /**
   * False where the engine can't save a card from a gateway token. WHMCS
   * only saves cards with the full number, which the console never holds.
   */
  savesCards?: boolean;
  /**
   * False where no registrar is connected, so an accepted domain stays
   * pending and a renewal doesn't move the expiry date (the WHMCS test
   * install). The orders and invoices are still checked.
   */
  domainsGoLive?: boolean;
}

let counter = 0;
const unique = (label: string) => `${label}-${Date.now().toString(36)}-${counter++}`;

export function billingContract(name: string, adapter: () => BillingAdapter, fixtures: () => Promise<ContractFixtures>) {
  describe(`billing adapter contract: ${name}`, () => {
    async function setUp() {
      const a = adapter();
      const f = await fixtures();
      const { clientId } = await a.createClient({
        companyName: unique("Contract Co"),
        firstName: "Thato",
        lastName: "Mosweu",
        email: `${unique("billing")}@example.co.bw`,
        country: "BW",
        currency: f.currency,
        city: "Gaborone",
      });
      const P = (minor: bigint) => money(minor, f.currency);
      const order = (quantity = 3, price = 57000n, createInvoice = true) =>
        a.placeOrder(clientId, {
          paymentMethod: PAYMENT_METHODS.eft,
          createInvoice,
          items: [{ productId: f.productId, quantity, billingCycle: "monthly", recurringPrice: P(price) }],
        });
      return { a, f, clientId, P, order };
    }

    it("creates, reads and updates a client", async () => {
      const { a, f, clientId } = await setUp();
      const client = await a.getClient(clientId);
      expect(client).toMatchObject({ clientId, firstName: "Thato", country: "BW", currency: f.currency, status: "active" });
      await a.updateClient(clientId, { phone: "+267 71 234 567" });
      // WHMCS keeps only the digits.
      expect((await a.getClient(clientId))?.phone?.replace(/\D/g, "")).toBe("26771234567");
      expect(await a.getClient("987654321")).toBeNull();
    });

    it("lists products with prices per currency", async () => {
      const { a, f } = await setUp();
      const products = await a.listProducts();
      const product = products.find((p) => p.productId === f.productId);
      expect(product?.prices[f.currency]?.monthly?.currency).toBe(f.currency);
    });

    it("places an order as pending, with an unpaid invoice whose lines add up", async () => {
      const { a, clientId, P, order } = await setUp();
      const placed = await order();
      expect(placed.serviceIds).toHaveLength(1);
      expect(placed.invoiceId).toBeDefined();

      const service = await a.getService(clientId, placed.serviceIds[0]);
      expect(service).toMatchObject({ status: "pending", quantity: 3, recurring: P(57000n), billingCycle: "monthly" });

      const invoice = (await a.getInvoice(clientId, placed.invoiceId!))!;
      expect(invoice.status).toBe("unpaid");
      const lineTotal = invoice.lines.reduce((t, l) => t + l.amount.amountMinor, 0n);
      expect(invoice.subtotal.amountMinor).toBe(lineTotal);
      expect(invoice.total.amountMinor).toBe(invoice.subtotal.amountMinor + invoice.tax.amountMinor);
      expect(invoice.balance).toEqual(invoice.total);
      expect(invoice.lines.some((l) => l.kind === "service" && l.relatedId === placed.serviceIds[0] && l.amount.amountMinor === 57000n)).toBe(true);

      expect((await a.listOrders(clientId)).find((o) => o.orderId === placed.orderId)?.status).toBe("pending");
      expect((await a.listInvoices(clientId)).map((i) => i.invoiceId)).toContain(placed.invoiceId);
      expect((await a.listInvoices(clientId, { status: "paid" })).map((i) => i.invoiceId)).not.toContain(placed.invoiceId);
    });

    it("can order without an invoice, to bill on the next monthly invoice", async () => {
      const { order } = await setUp();
      const placed = await order(1, 19000n, false);
      expect(placed.invoiceId).toBeUndefined();
    });

    it("refuses an order in another currency, or with nothing in it", async () => {
      const { a, f, clientId } = await setUp();
      const other = f.currency === "USD" ? "BWP" : "USD";
      await expect(
        a.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: f.productId, quantity: 1, billingCycle: "monthly", recurringPrice: money(100n, other) }] }),
      ).rejects.toBeInstanceOf(BillingError);
      await expect(a.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [] })).rejects.toBeInstanceOf(BillingError);
    });

    it("activates an accepted order, which then can't be cancelled", async () => {
      const { a, clientId, order } = await setUp();
      const placed = await order();
      await a.acceptOrder(placed.orderId);
      expect((await a.getService(clientId, placed.serviceIds[0]))?.status).toBe("active");
      expect((await a.listOrders(clientId)).find((o) => o.orderId === placed.orderId)?.status).toBe("active");
      await expect(a.cancelOrder(placed.orderId)).rejects.toMatchObject({ code: "conflict" });
    });

    it("cancels a pending order with its services and invoice", async () => {
      const { a, clientId, order } = await setUp();
      const placed = await order();
      await a.cancelOrder(placed.orderId);
      expect((await a.getService(clientId, placed.serviceIds[0]))?.status).toBe("cancelled");
      expect((await a.getInvoice(clientId, placed.invoiceId!))?.status).toBe("cancelled");
    });

    it("takes part payments, marks the invoice paid once covered, and refuses more", async () => {
      const { a, clientId, P, order } = await setUp();
      const placed = await order(2, 30000n);
      const invoiceId = placed.invoiceId!;
      const total = (await a.getInvoice(clientId, invoiceId))!.total;
      const paidAt = new Date();

      await a.recordPayment(invoiceId, { amount: P(10000n), gateway: PAYMENT_METHODS.eft, reference: unique("EFT"), paidAt });
      let invoice = (await a.getInvoice(clientId, invoiceId))!;
      expect(invoice.status).toBe("unpaid");
      expect(invoice.balance.amountMinor).toBe(total.amountMinor - 10000n);

      await expect(a.recordPayment(invoiceId, { amount: money(1n, total.currency === "USD" ? "BWP" : "USD"), gateway: "x", reference: "x", paidAt })).rejects.toBeInstanceOf(BillingError);

      await a.recordPayment(invoiceId, { amount: P(total.amountMinor - 10000n), gateway: PAYMENT_METHODS.eft, reference: unique("EFT"), paidAt });
      invoice = (await a.getInvoice(clientId, invoiceId))!;
      expect(invoice.status).toBe("paid");
      expect(invoice.balance.amountMinor).toBe(0n);
      expect(invoice.paidOn).toBeDefined();
      expect(invoice.payments).toHaveLength(2);

      await expect(a.recordPayment(invoiceId, { amount: P(1n), gateway: PAYMENT_METHODS.eft, reference: unique("EFT"), paidAt })).rejects.toMatchObject({ code: "conflict" });
      const txns = await a.listTransactions(clientId);
      expect(txns.filter((t) => t.invoiceId === invoiceId)).toHaveLength(2);
    });

    it("never shows one client's services or invoices to another", async () => {
      const first = await setUp();
      const placed = await first.order();
      const { clientId: otherClient } = await first.a.createClient({ companyName: unique("Other Co"), firstName: "Kago", lastName: "Seretse", email: `${unique("other")}@example.co.bw`, country: "BW", currency: first.f.currency });
      expect(await first.a.getService(otherClient, placed.serviceIds[0])).toBeNull();
      expect(await first.a.getInvoice(otherClient, placed.invoiceId!)).toBeNull();
      expect(await first.a.listServices(otherClient)).toEqual([]);
      expect(await first.a.listInvoices(otherClient)).toEqual([]);
      expect(await first.a.listTransactions(otherClient)).toEqual([]);
    });

    it("previews and applies a change to an active service", async () => {
      const { a, clientId, P, order } = await setUp();
      const placed = await order(3, 57000n);
      await a.acceptOrder(placed.orderId);
      const serviceId = placed.serviceIds[0];

      const preview = await a.previewUpgrade(serviceId, { quantity: 5, recurringPrice: P(95000n) });
      expect(preview.currentRecurring).toEqual(P(57000n));
      expect(preview.newRecurring).toEqual(P(95000n));
      expect(preview.daysLeft).toBeLessThanOrEqual(preview.daysInPeriod);
      expect(preview.dueNow.amountMinor >= 0n && preview.dueNow.amountMinor <= 38000n).toBe(true);

      const done = await a.upgradeService(serviceId, { quantity: 5, recurringPrice: P(95000n) }, PAYMENT_METHODS.eft);
      expect(done.orderId).toBeTruthy();
      expect(await a.getService(clientId, serviceId)).toMatchObject({ quantity: 5, recurring: P(95000n) });
      if (preview.dueNow.amountMinor > 0n) {
        const invoice = (await a.getInvoice(clientId, done.invoiceId!))!;
        expect(invoice.lines.some((l) => l.kind === "upgrade" && l.amount.amountMinor === preview.dueNow.amountMinor)).toBe(true);
      }
    });

    it("refuses to change a service that isn't active", async () => {
      const { a, P, order } = await setUp();
      const placed = await order();
      await expect(a.previewUpgrade(placed.serviceIds[0], { quantity: 4, recurringPrice: P(76000n) })).rejects.toMatchObject({ code: "conflict" });
    });

    it("suspends, unsuspends and terminates", async () => {
      const { a, clientId, order } = await setUp();
      const placed = await order();
      await a.acceptOrder(placed.orderId);
      const id = placed.serviceIds[0];
      await a.runModuleAction(id, "suspend", "Asked by customer");
      expect(await a.getService(clientId, id)).toMatchObject({ status: "suspended", suspendReason: "Asked by customer" });
      await expect(a.runModuleAction(id, "suspend")).rejects.toMatchObject({ code: "conflict" });
      await a.runModuleAction(id, "unsuspend");
      expect((await a.getService(clientId, id))?.status).toBe("active");
      await a.runModuleAction(id, "terminate");
      expect((await a.getService(clientId, id))?.status).toBe("terminated");
    });

    it("keeps a purchase order number in the invoice notes", async () => {
      const { a, clientId, order } = await setUp();
      const { invoiceId } = await order();
      await a.setPurchaseOrder(invoiceId!, "PO-4471");
      expect((await a.getInvoice(clientId, invoiceId!))?.notes).toContain("PO: PO-4471");
      await a.setPurchaseOrder(invoiceId!, "PO-4480");
      const notes = (await a.getInvoice(clientId, invoiceId!))?.notes ?? "";
      expect(notes).toContain("PO: PO-4480");
      expect(notes).not.toContain("PO-4471");
      await a.setPurchaseOrder(invoiceId!, null);
      expect((await a.getInvoice(clientId, invoiceId!))?.notes ?? "").not.toContain("PO:");
    });

    it("checks, registers, activates and renews domains", async () => {
      const { a, f, clientId, P } = await setUp();
      expect(await a.checkDomain(f.takenDomain)).toMatchObject({ supported: true, available: false });
      expect(await a.checkDomain(f.unsupportedDomain)).toMatchObject({ supported: false, available: false });
      await expect(a.checkDomain("not a domain")).rejects.toMatchObject({ code: "invalid" });

      const name = f.freshDomain();
      expect(await a.checkDomain(name.toUpperCase())).toEqual({ name, supported: true, available: true });
      const pricing = await a.getTldPricing(f.currency);
      const tld = pricing.find((t) => t.tld === f.tld)!;
      expect(tld.register.currency).toBe(f.currency);

      const placed = await a.registerDomain(clientId, { name, years: 1, price: tld.register, paymentMethod: PAYMENT_METHODS.eft });
      expect(placed.invoiceId).toBeDefined();
      expect(await a.checkDomain(name)).toMatchObject({ available: false });
      await expect(a.registerDomain(clientId, { name, years: 1, price: tld.register, paymentMethod: PAYMENT_METHODS.eft })).rejects.toMatchObject({ code: "conflict" });

      let domain = (await a.listDomains(clientId)).find((d) => d.name === name)!;
      expect(domain.status).toBe("pending");
      await a.acceptOrder(placed.orderId);
      if (f.domainsGoLive === false) return;
      domain = (await a.listDomains(clientId)).find((d) => d.name === name)!;
      expect(domain.status).toBe("active");

      const renewed = await a.renewDomain(clientId, domain.domainId, 2, PAYMENT_METHODS.eft);
      const after = (await a.listDomains(clientId)).find((d) => d.name === name)!;
      expect(after.expiresOn.getUTCFullYear()).toBe(domain.expiresOn.getUTCFullYear() + 2);
      const invoice = (await a.getInvoice(clientId, renewed.invoiceId!))!;
      expect(invoice.total.amountMinor >= domain.renewal.amountMinor * 2n).toBe(true);
      void P;
    });

    it("transfers in a domain registered elsewhere, and needs the code", async () => {
      const { a, f, clientId } = await setUp();
      const price = (await a.getTldPricing(f.currency)).find((t) => t.tld === f.tld)!.transfer;
      await expect(a.transferDomain(clientId, { name: f.takenDomain, years: 1, price, paymentMethod: PAYMENT_METHODS.eft, authCode: " " })).rejects.toBeInstanceOf(BillingError);
      await expect(a.transferDomain(clientId, { name: f.freshDomain(), years: 1, price, paymentMethod: PAYMENT_METHODS.eft, authCode: "abc123" })).rejects.toBeInstanceOf(BillingError);
    });

    it("saves a card from the gateway without the card number", async () => {
      const { a, f, clientId } = await setUp();
      if (f.savesCards === false) {
        await expect(a.addPayMethod(clientId, { gateway: "stubcard", gatewayToken: "tok_123", cardBrand: "Visa", lastFour: "4242", expiry: "08/29", setDefault: false })).rejects.toMatchObject({ code: "invalid" });
        expect(await a.listPayMethods(clientId)).toEqual([]);
        return;
      }
      await a.addPayMethod(clientId, { gateway: "stubcard", gatewayToken: "tok_123", cardBrand: "Visa", lastFour: "4242", expiry: "08/29", setDefault: false });
      const methods = await a.listPayMethods(clientId);
      expect(methods).toHaveLength(1);
      expect(methods[0]).toMatchObject({ kind: "card", lastFour: "4242", isDefault: true });
    });
  });
}
