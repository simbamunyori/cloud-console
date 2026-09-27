import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  MoneyParseError,
  add,
  applyBps,
  divCeil,
  divRound,
  formatMoney,
  fromJson,
  money,
  parseMoney,
  subtract,
  times,
  toJson,
  total,
} from "./money";

const P = (n: bigint) => money(n, "BWP");

describe("parseMoney", () => {
  it.each([
    ["12400", 1240000n],
    ["12,400", 1240000n],
    ["P 12 400.5", 1240050n],
    ["12400.50", 1240050n],
    ["0.01", 1n],
    ["BWP 171,630.40", 17163040n],
    ["-5", -500n],
    ["7.", 700n],
  ])("reads %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "12..0", "1e5", "--1"])("rejects %s", (input) => {
    expect(() => parseMoney(input)).toThrow(MoneyParseError);
  });

  it("handles amounts beyond float precision", () => {
    expect(parseMoney("90071992547409.93")).toBe(9007199254740993n);
  });

  it("refuses a currency it doesn't know", () => {
    expect(() => parseMoney("1", "XXX")).toThrow();
  });
});

describe("formatMoney", () => {
  it("groups thousands and keeps two decimals", () => {
    expect(formatMoney(P(20909813n))).toBe("P 209,098.13");
    expect(formatMoney(P(5n))).toBe("P 0.05");
    expect(formatMoney(P(0n))).toBe("P 0.00");
    expect(formatMoney(money(1999n, "USD"))).toBe("US$ 19.99");
  });

  it("uses a true minus sign", () => {
    expect(formatMoney(P(-1240000n))).toBe("−P 12,400.00");
  });

  it("can show a plus sign for credits", () => {
    expect(formatMoney(P(100n), { signed: true })).toBe("+P 1.00");
  });
});

describe("arithmetic", () => {
  it("adds, subtracts and multiplies in one currency", () => {
    expect(add(P(150n), P(250n))).toEqual(P(400n));
    expect(subtract(P(150n), P(250n))).toEqual(P(-100n));
    expect(times(P(12345n), 7)).toEqual(P(86415n));
    expect(total([P(1n), P(2n), P(3n)], "BWP")).toEqual(P(6n));
    expect(total([], "BWP")).toEqual(P(0n));
  });

  it("never mixes currencies", () => {
    expect(() => add(P(1n), money(1n, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => total([P(1n), money(1n, "USD")], "BWP")).toThrow(CurrencyMismatchError);
  });

  it("rounds half away from zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divCeil(1n, 100n)).toBe(1n);
    expect(divCeil(100n, 100n)).toBe(1n);
    expect(divCeil(0n, 100n)).toBe(0n);
  });

  it("applies basis points", () => {
    expect(applyBps(10000n, 1500)).toBe(1500n);
    expect(applyBps(333n, 5000)).toBe(167n);
  });

  it("round-trips through JSON without floats", () => {
    const m = P(9007199254740993n);
    expect(fromJson(toJson(m))).toEqual(m);
    expect(() => fromJson({ amountMinor: "1.5", currency: "BWP" })).toThrow();
  });
});
