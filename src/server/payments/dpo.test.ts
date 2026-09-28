import { describe, expect, it } from "vitest";
import { money } from "@/lib/domain/money";
import { DpoGateway, dpoField } from "./dpo";

const config = { apiUrl: "https://dpo.test/API/v6/", payUrl: "https://dpo.test/payv2.php", companyToken: "COMPANY-TOKEN", serviceType: "5525", gateway: "dpo" };
const at = new Date("2026-09-28T14:05:00Z");
const amount = money(190000n, "BWP");

/** A pretend DPO: answers each call with the next reply and keeps what it was sent. */
function fakeDpo(...replies: (string | Error | number)[]) {
  const sent: string[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    sent.push(String(init.body));
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    if (typeof reply === "number") return new Response("", { status: reply });
    return new Response(reply ?? "", { status: 200 });
  }) as unknown as typeof fetch;
  return { gateway: new DpoGateway(config, fetcher, () => at), sent };
}

const xml = (fields: Record<string, string>) => `<?xml version="1.0" encoding="utf-8"?><API3G>${Object.entries(fields).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</API3G>`;
const check = { paymentRef: "CP-abc", gatewayToken: "TOKEN-1", amount };

describe("DPO Pay", () => {
  it("starts a payment on DPO's hosted page for the exact amount and currency", async () => {
    const { gateway, sent } = fakeDpo(xml({ Result: "000", ResultExplanation: "Transaction created", TransToken: "TOKEN-1", TransRef: "R1" }));
    const started = await gateway.startCardPayment({ paymentRef: "CP-abc", amount, description: "Invoice INV-2026-0012 & more", returnUrl: "https://console.test/app/billing/card-return?ref=CP-abc" });
    expect(started).toEqual({ redirectUrl: "https://dpo.test/payv2.php?ID=TOKEN-1", gatewayToken: "TOKEN-1" });
    const body = sent[0];
    expect(dpoField(body, "CompanyToken")).toBe("COMPANY-TOKEN");
    expect(dpoField(body, "Request")).toBe("createToken");
    expect(dpoField(body, "PaymentAmount")).toBe("1900.00");
    expect(dpoField(body, "PaymentCurrency")).toBe("BWP");
    expect(dpoField(body, "CompanyRef")).toBe("CP-abc");
    expect(dpoField(body, "ServiceType")).toBe("5525");
    expect(dpoField(body, "ServiceDate")).toBe("2026/09/28 14:05");
    // Text is escaped, so a description can't break the XML.
    expect(body).toContain("Invoice INV-2026-0012 &amp; more");
    expect(dpoField(body, "RedirectURL")).toBe("https://console.test/app/billing/card-return?ref=CP-abc");
  });

  it("says card payments are unavailable when DPO refuses or can't be reached", async () => {
    for (const reply of [xml({ Result: "802", ResultExplanation: "Company token does not exist" }), 500, new Error("network down")]) {
      const { gateway } = fakeDpo(reply);
      await expect(gateway.startCardPayment({ paymentRef: "CP-abc", amount, description: "Invoice", returnUrl: "https://console.test/r" })).rejects.toMatchObject({ code: "unavailable" });
    }
  });

  it("treats a payment as paid only when DPO says so, for the amount asked", async () => {
    const paid = fakeDpo(xml({ Result: "000", ResultExplanation: "Transaction Paid", CustomerCredit: "xxxx4242", TransactionCurrency: "BWP", TransactionAmount: "1900.00" }));
    expect(await paid.gateway.confirm(check)).toEqual({ status: "succeeded", paidAt: at, lastFour: "4242" });
    expect(dpoField(paid.sent[0], "Request")).toBe("verifyToken");
    expect(dpoField(paid.sent[0], "TransactionToken")).toBe("TOKEN-1");

    const wrongAmount = fakeDpo(xml({ Result: "000", TransactionCurrency: "BWP", TransactionAmount: "19.00" }));
    expect(await wrongAmount.gateway.confirm(check)).toMatchObject({ status: "failed" });
    const wrongCurrency = fakeDpo(xml({ Result: "000", TransactionCurrency: "USD", TransactionAmount: "1900.00" }));
    expect(await wrongCurrency.gateway.confirm(check)).toMatchObject({ status: "failed" });
  });

  it("maps DPO's answers to paid, failed or not yet", async () => {
    const cases: [string, string][] = [
      ["900", "pending"],
      ["003", "pending"],
      ["901", "failed"],
      ["903", "failed"],
      ["904", "failed"],
      ["002", "failed"],
    ];
    for (const [result, status] of cases) {
      const { gateway } = fakeDpo(xml({ Result: result }));
      expect((await gateway.confirm(check)).status, result).toBe(status);
    }
    const cancelled = fakeDpo(xml({ Result: "904" }));
    expect(await cancelled.gateway.confirm(check)).toEqual({ status: "failed", reason: "The payment was cancelled before it went through." });
  });

  it("leaves a payment open when DPO can't be asked, and never asks without a token", async () => {
    expect(await fakeDpo(new Error("timeout")).gateway.confirm(check)).toEqual({ status: "pending" });
    expect(await fakeDpo(503).gateway.confirm(check)).toEqual({ status: "pending" });
    const none = fakeDpo();
    expect(await none.gateway.confirm({ ...check, gatewayToken: null })).toEqual({ status: "pending" });
    expect(none.sent).toHaveLength(0);
  });
});
