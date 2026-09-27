import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { money } from "@/lib/domain/money";
import type { Domain, Invoice, InvoiceSummary, Service, Transaction } from "./adapter";
import { amountOwed, attentionItems, buildStatement, compareInvoices, invoicesBefore, monthlyTotal, nextInvoice } from "./views";

const P = (n: bigint) => money(n, "BWP");
const d = (s: string) => parseDateOnly(s)!;

function service(over: Partial<Service>): Service {
  return { serviceId: "1", productId: "1", name: "Web hosting", groupName: "Web", status: "active", quantity: 1, recurring: P(12000n), billingCycle: "monthly", registeredOn: d("2026-01-01"), nextDueOn: d("2026-10-01"), details: {}, ...over };
}
function summary(over: Partial<InvoiceSummary>): InvoiceSummary {
  return { invoiceId: "1", number: "INV-1", issuedOn: d("2026-09-01"), dueOn: d("2026-09-08"), status: "unpaid", total: P(1000n), ...over };
}
function invoice(over: Partial<Invoice>): Invoice {
  return { ...summary({}), subtotal: P(0n), tax: P(0n), taxRateBps: 0, balance: P(0n), lines: [], payments: [], ...over };
}
const domain = (over: Partial<Domain>): Domain => ({ domainId: "5", name: "acme.co.bw", registrar: "cocca", status: "active", registeredOn: d("2025-10-10"), expiresOn: d("2026-10-10"), nextDueOn: d("2026-10-10"), renewal: P(18000n), registrationYears: 1, autoRenew: true, ...over });

describe("billing views", () => {
  it("adds up the monthly total, spreading annual prices", () => {
    const total = monthlyTotal(
      [service({ recurring: P(190000n) }), service({ recurring: P(120000n), billingCycle: "annually" }), service({ status: "cancelled" }), service({ status: "pending" }), service({ status: "suspended", recurring: P(500n) })],
      "BWP",
    );
    expect(total).toEqual(P(190000n + 10000n + 500n));
  });

  it("finds what falls due next", () => {
    const next = nextInvoice([service({ nextDueOn: d("2026-10-01"), recurring: P(100n) }), service({ nextDueOn: d("2026-10-01"), recurring: P(50n) }), service({ nextDueOn: d("2026-11-01") })], [domain({ nextDueOn: d("2026-10-01"), registrationYears: 2 })], "BWP");
    expect(next).toEqual({ dueOn: d("2026-10-01"), amount: P(150n + 36000n) });
    expect(nextInvoice([], [], "BWP")).toBeNull();
    expect(amountOwed([summary({ total: P(5n) }), summary({ status: "paid", total: P(7n) })], "BWP")).toEqual(P(5n));
  });

  it("lists what needs attention, worst first", () => {
    const items = attentionItems(
      [summary({ invoiceId: "1", number: "INV-1", dueOn: d("2026-09-20") }), summary({ invoiceId: "2", number: "INV-2", dueOn: d("2026-10-01") }), summary({ invoiceId: "3", status: "paid" })],
      [service({ serviceId: "7", name: "Managed VPS", status: "pending" }), service({ serviceId: "8", name: "Backup", status: "suspended", suspendReason: "Overdue on payment" })],
      [domain({ expiresOn: d("2026-10-10"), autoRenew: false }), domain({ domainId: "6", name: "old.bw", status: "expired" })],
      d("2026-09-27"),
      "en-BW",
    );
    expect(items.map((i) => [i.tone, i.title])).toEqual([
      ["negative", "Invoice INV-1 is overdue"],
      ["negative", "Backup is paused"],
      ["negative", "old.bw has expired"],
      ["warning", "Invoice INV-2 is due on 1 Oct"],
      ["warning", "acme.co.bw expires in 13 days"],
      ["info", "Managed VPS is being set up"],
    ]);
    expect(items[0].detail.replace(/\u00a0/gu, " ")).toBe("P 10.00 was due 7 days ago.");
  });

  it("compares an invoice with the previous month's", () => {
    const line = (lineId: string, relatedId: string, amount: bigint, kind: Invoice["lines"][number]["kind"] = "service") => ({ lineId, kind, relatedId, description: `Line ${relatedId}`, amount: P(amount), taxed: true });
    const previous = invoice({ invoiceId: "10", total: P(300n), lines: [line("a", "1", 100n), line("b", "2", 100n), line("c", "3", 100n)] });
    const current = invoice({ invoiceId: "11", total: P(420n), lines: [line("d", "1", 100n), line("e", "2", 120n), line("f", "4", 200n), line("g", "9", 0n, "setup")] });
    const c = compareInvoices(current, previous);
    expect(c.lines.get("d")).toEqual({ kind: "same" });
    expect(c.lines.get("e")).toEqual({ kind: "up", previous: P(100n), previousDescription: "Line 2" });
    expect(c.lines.get("f")).toEqual({ kind: "new" });
    expect(c.lines.has("g")).toBe(false);
    expect(c.removed).toEqual([{ description: "Line 3", amount: P(100n) }]);
    expect(c.difference).toEqual(P(120n));
    expect(compareInvoices(current, null).difference).toBeNull();
  });

  it("orders earlier invoices newest first", () => {
    const all = [summary({ invoiceId: "1", issuedOn: d("2026-07-01") }), summary({ invoiceId: "2", issuedOn: d("2026-08-01") }), summary({ invoiceId: "3", issuedOn: d("2026-08-01"), status: "cancelled" }), summary({ invoiceId: "4", issuedOn: d("2026-09-01") })];
    expect(invoicesBefore(all, all[3]).map((i) => i.invoiceId)).toEqual(["2", "1"]);
  });

  it("builds a statement with opening, running and closing balances", () => {
    const invoices = [
      summary({ invoiceId: "1", number: "INV-1", issuedOn: d("2026-07-25"), total: P(1000n), status: "paid" }),
      summary({ invoiceId: "2", number: "INV-2", issuedOn: d("2026-08-25"), total: P(1200n), status: "paid" }),
      summary({ invoiceId: "3", number: "INV-3", issuedOn: d("2026-09-10"), total: P(99n), status: "cancelled" }),
      summary({ invoiceId: "4", number: "INV-4", issuedOn: d("2026-09-24"), total: P(1200n) }),
    ];
    const tx = (date: string, amountIn: bigint, amountOut = 0n): Transaction => ({ transactionId: date, date: new Date(`${date}T10:00:00Z`), gateway: "banktransfer", reference: `FNB ${date}`, amountIn: P(amountIn), amountOut: P(amountOut), description: "" });
    const s = buildStatement(invoices, [tx("2026-07-28", 1000n), tx("2026-09-02", 1200n), tx("2026-09-20", 0n, 50n)], d("2026-08-01"), d("2026-09-30"), "BWP");
    expect(s.opening).toEqual(P(0n));
    expect(s.rows.map((r) => [r.kind, r.reference, r.balance.amountMinor])).toEqual([
      ["invoice", "INV-2", 1200n],
      ["payment", "FNB 2026-09-02", 0n],
      ["payment", "FNB 2026-09-20", 50n],
      ["invoice", "INV-4", 1250n],
    ]);
    expect(s.rows[2].description).toBe("Refund");
    expect(s.charges).toEqual(P(2400n));
    expect(s.payments).toEqual(P(1150n));
    expect(s.closing).toEqual(P(1250n));
    expect(buildStatement(invoices, [], d("2026-09-01"), d("2026-09-30"), "BWP").opening).toEqual(P(2200n));
  });
});
