import { describe, expect, it, vi } from "vitest";
import { assertNoPlaceholders, findPlaceholders } from "./placeholders";

const market = (over: Record<string, unknown> = {}) => ({ code: "bw", supportEmail: "support@fourthgen.co.bw", eftBankName: "First National Bank Botswana", eftAccountNumber: "62812345678", eftBranchCode: "281467", ...over });

function fakeDb({ markets = [market()], seededRates = [] as { month: string; base: string; quote: string }[], demoUsers = [] as { email: string }[] } = {}) {
  return {
    market: { findMany: async () => markets },
    fxRate: { findMany: async () => seededRates },
    user: { findMany: async () => demoUsers },
  } as unknown as Parameters<typeof findPlaceholders>[0];
}
const live = { APP_URL: "https://console.fourthgen.co.bw", MAIL_FROM: "Fourth Generation Technologies <no-reply@fourthgen.co.bw>", NODE_ENV: "production" as const };

describe("production placeholders", () => {
  it("finds nothing once everything is real", async () => {
    expect(await findPlaceholders(fakeDb(), live)).toEqual([]);
  });

  it("finds each placeholder the seed and defaults leave behind", async () => {
    const found = await findPlaceholders(
      fakeDb({
        markets: [market({ supportEmail: "support@localhost", eftBankName: "Demo Bank Botswana", eftAccountNumber: "000000000000" }), market({ code: "za", supportEmail: "support@localhost", eftBankName: null, eftAccountNumber: null, eftBranchCode: null })],
        seededRates: [{ month: "2026-09", base: "USD", quote: "BWP" }],
        demoUsers: [{ email: "demo@kgalehill.co.bw" }],
      }),
      { APP_URL: "http://localhost:3000", MAIL_FROM: "Fourth Generation Technologies <no-reply@localhost>" },
    );
    expect(found).toHaveLength(7);
    expect(found.join("\n")).toMatch(/APP_URL/);
    expect(found.join("\n")).toMatch(/MAIL_FROM/);
    expect(found.filter((f) => /support email is support@localhost/.test(f))).toHaveLength(2);
    expect(found.join("\n")).toMatch(/Market bw: the bank details are the demo ones/);
    expect(found.join("\n")).toMatch(/exchange rate is a demo value \(USD to BWP for 2026-09\)/);
    expect(found.join("\n")).toMatch(/demo@kgalehill\.co\.bw/);
  });

  it("needs WHMCS billing, fully set up and pointing at production WHMCS", async () => {
    expect(await findPlaceholders(fakeDb(), { ...live, BILLING_ADAPTER: "stub" })).toEqual([expect.stringMatching(/BILLING_ADAPTER is stub/)]);
    expect(await findPlaceholders(fakeDb(), { ...live, BILLING_ADAPTER: "whmcs", WHMCS_API_URL: "https://billing.example/includes/api.php", WHMCS_ENVIRONMENT: "production" })).toEqual([
      expect.stringMatching(/WHMCS_API_IDENTIFIER, WHMCS_API_SECRET are not set/),
    ]);
    expect(await findPlaceholders(fakeDb(), { ...live, BILLING_ADAPTER: "whmcs", WHMCS_API_URL: "https://billing.example/includes/api.php", WHMCS_API_IDENTIFIER_SET: true, WHMCS_API_SECRET_SET: true, WHMCS_ENVIRONMENT: "test" })).toEqual([
      expect.stringMatching(/WHMCS_ENVIRONMENT is not production/),
    ]);
    expect(await findPlaceholders(fakeDb(), { ...live, BILLING_ADAPTER: "whmcs", WHMCS_API_URL: "https://billing.example/includes/api.php", WHMCS_API_IDENTIFIER_SET: true, WHMCS_API_SECRET_SET: true, WHMCS_ENVIRONMENT: "production" })).toEqual([]);
  });

  it("refuses to start in production, starts in development, and lets a demo server start with a warning", async () => {
    const db = fakeDb({ markets: [market({ supportEmail: "support@localhost" })] });
    await expect(assertNoPlaceholders(db, live, false)).rejects.toThrow(/Refusing to start in production[\s\S]*support@localhost/);
    await expect(assertNoPlaceholders(db, { ...live, NODE_ENV: "development" }, false)).resolves.toBeUndefined();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(assertNoPlaceholders(db, live, true)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ALLOW_PLACEHOLDERS=yes/));
    warn.mockRestore();
  });
});
