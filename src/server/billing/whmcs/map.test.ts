import { describe, expect, it } from "vitest";
import { money } from "@/lib/domain/money";
import { amount, date, fromAddOrder, fromDomain, fromInvoice, fromInvoiceSummary, fromProduct, fromService, fromTldPricing, list, phpSerialize, toAddInvoicePayment, toAddOrder, toAmount } from "./map";

// Response shapes follow the examples at developers.whmcs.com (docs/whmcs-api-notes.md).
const P = (minor: bigint) => money(minor, "BWP");

describe("WHMCS mapping", () => {
  it("reads amounts and dates as WHMCS sends them", () => {
    expect(amount("1234.50", "BWP")).toEqual(P(123450n));
    expect(amount("-8.67", "BWP")).toEqual(P(-867n));
    expect(amount("", "BWP")).toEqual(P(0n));
    expect(toAmount(P(123450n))).toBe("1234.50");
    expect(toAmount(P(-5n))).toBe("-0.05");
    expect(date("0000-00-00")).toBeUndefined();
    expect(date("2026-09-27 10:15:00")?.toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  it("unwraps nested lists, including empty strings", () => {
    expect(list({ invoice: [{ id: 1 }] }, "invoice")).toEqual([{ id: 1 }]);
    expect(list({ invoice: { id: 1 } }, "invoice")).toEqual([{ id: 1 }]);
    expect(list("", "transaction")).toEqual([]);
  });

  it("maps GetProducts pricing, skipping switched-off cycles", () => {
    const p = fromProduct({ pid: 7, gid: 2, name: "VPS", type: "server", pricing: { BWP: { prefix: "P", monthly: "850.00", annually: "-1.00", msetupfee: "0.00" } } });
    expect(p.prices.BWP).toEqual({ monthly: P(85000n), annually: undefined, setup: P(0n) });
  });

  it("builds AddOrder with price overrides and serialized options", () => {
    const params = toAddOrder("12", {
      paymentMethod: "banktransfer",
      createInvoice: false,
      items: [{ productId: "7", quantity: 3, billingCycle: "monthly", recurringPrice: P(255000n), options: { "4": "Ubuntu 24.04" } }],
    });
    expect(params).toMatchObject({ clientid: "12", paymentmethod: "banktransfer", noinvoice: "true", "pid[0]": "7", "qty[0]": "3", "billingcycle[0]": "monthly", "priceoverride[0]": "2550.00" });
    expect(Buffer.from(params["configoptions[0]"], "base64").toString()).toBe('a:1:{i:4;s:12:"Ubuntu 24.04";}');
    expect(fromAddOrder({ result: "success", orderid: 5, serviceids: "10,11", addonids: "", domainids: "", invoiceid: 0 })).toEqual({ orderId: "5", invoiceId: undefined, serviceIds: ["10", "11"], domainIds: [] });
  });

  it("serializes like PHP, counting bytes", () => {
    expect(phpSerialize({ os: "Gaborone é" })).toBe('a:1:{s:2:"os";s:11:"Gaborone é";}');
  });

  it("maps a service and drops its password", () => {
    const s = fromService(
      { id: 44, pid: 7, orderid: 5, regdate: "2026-06-01", name: "VPS", groupname: "Servers", status: "Active", qty: "1", recurringamount: "850.00", billingcycle: "Monthly", nextduedate: "2026-10-01", password: "hunter2", diskusage: "2048", disklimit: "40960", bwusage: "0", bwlimit: "0", configoptions: { configoption: [{ id: 1, option: "Operating system", type: "dropdown", value: "Ubuntu" }] } },
      "BWP",
    );
    expect(s).toMatchObject({ serviceId: "44", status: "active", recurring: P(85000n), billingCycle: "monthly" });
    expect(s.details).toEqual({ resources: [{ label: "Operating system", value: "Ubuntu" }], usage: [{ label: "Disk", used: 2048, limit: 40960, unit: "MB" }] });
    expect(JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("hunter2");
  });

  it("maps invoices, with lines, tax and payments", () => {
    const summary = fromInvoiceSummary({ id: 9, invoicenum: "", date: "2026-09-01", duedate: "2026-09-08", datepaid: "0000-00-00 00:00:00", total: "1140.00", status: "Unpaid", currencycode: "BWP" });
    expect(summary).toMatchObject({ invoiceId: "9", number: "9", status: "unpaid", paidOn: undefined, total: P(114000n) });
    const invoice = fromInvoice(
      {
        invoiceid: 9, invoicenum: "INV-2026-0009", date: "2026-09-01", duedate: "2026-09-08", datepaid: "0000-00-00 00:00:00", subtotal: "1000.00", tax: "140.00", tax2: "0.00", total: "1140.00", balance: "140.00", taxrate: "14.00", status: "Unpaid", notes: "PO: 4471",
        items: { item: [{ id: 1, type: "Hosting", relid: 44, description: "VPS", amount: "1000.00", taxed: 1 }] },
        transactions: { transaction: [{ id: 3, date: "2026-09-02 09:00:00", gateway: "banktransfer", transid: "FNB 1", amountin: "1000.00", amountout: "0.00", invoiceid: 9, description: "Invoice Payment" }] },
      },
      "BWP",
    );
    expect(invoice).toMatchObject({ number: "INV-2026-0009", taxRateBps: 1400, tax: P(14000n), balance: P(14000n), notes: "PO: 4471" });
    expect(invoice.lines[0]).toMatchObject({ kind: "service", relatedId: "44", taxed: true });
    expect(invoice.payments[0]).toMatchObject({ reference: "FNB 1", amountIn: P(100000n) });
    expect(fromInvoice({ invoiceid: 1, date: "2026-09-01", duedate: "2026-09-01", total: "0", items: "", transactions: "" }, "BWP").payments).toEqual([]);
  });

  it("formats AddInvoicePayment dates as WHMCS wants", () => {
    expect(toAddInvoicePayment("9", { amount: P(100000n), gateway: "banktransfer", reference: "FNB 1", paidAt: new Date("2026-09-02T09:05:07Z") })).toMatchObject({ date: "2026-09-02 09:05:07", amount: "1000.00" });
  });

  it("maps domains and TLD pricing", () => {
    const d = fromDomain({ id: 3, domainname: "kgalehill.co.bw", registrar: "cocca", regperiod: 1, recurringamount: "180.00", regdate: "2025-10-01", expirydate: "2026-10-01", nextduedate: "2026-10-01", status: "Active", donotrenew: 0 }, "BWP");
    expect(d).toMatchObject({ name: "kgalehill.co.bw", status: "active", renewal: P(18000n), autoRenew: true });
    expect(fromTldPricing({ currency: { code: "BWP" }, pricing: { "co.bw": { register: { "1": "180.00" }, renew: { "1": "180.00" }, transfer: { "1": "180.00" } } } })).toEqual([
      { tld: ".co.bw", register: P(18000n), renew: P(18000n), transfer: P(18000n) },
    ]);
  });
});
