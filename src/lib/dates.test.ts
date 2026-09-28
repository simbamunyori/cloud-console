import { describe, expect, it } from "vitest";
import { addMonths, daysBetween, endOfMonth, formatDay, formatLongDate, formatMoment, formatRange, parseDateOnly, startOfMonth, todayIn, toDateOnly } from "./dates";

describe("dates", () => {
  it("parses only real calendar dates", () => {
    expect(toDateOnly(parseDateOnly("2026-09-24")!)).toBe("2026-09-24");
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("24/09/2026")).toBeNull();
  });

  it("finds today in the organisation's time zone", () => {
    // 23:30 UTC on the 24th is already the 25th in Gaborone (UTC+2).
    expect(toDateOnly(todayIn("Africa/Gaborone", new Date("2026-09-24T23:30:00Z")))).toBe("2026-09-25");
    expect(toDateOnly(todayIn("UTC", new Date("2026-09-24T23:30:00Z")))).toBe("2026-09-24");
  });

  it("finds month bounds", () => {
    const d = parseDateOnly("2026-02-14")!;
    expect(toDateOnly(startOfMonth(d))).toBe("2026-02-01");
    expect(toDateOnly(endOfMonth(d))).toBe("2026-02-28");
  });

  it("formats for people", () => {
    const d = parseDateOnly("2026-09-24")!;
    expect(formatDay(d)).toBe("24 Sep");
    expect(formatLongDate(d)).toBe("Thursday 24 September 2026");
    expect(formatRange(parseDateOnly("2026-09-01")!, d)).toBe("1 – 24 Sep 2026");
    expect(formatRange(parseDateOnly("2026-08-28")!, d)).toBe("28 Aug – 24 Sep 2026");
    expect(formatRange(parseDateOnly("2025-12-28")!, d)).toBe("28 Dec 2025 – 24 Sep 2026");
  });
});

describe("formatMoment", () => {
  it("shows the time where the organisation is", () => {
    expect(formatMoment(new Date("2026-09-24T14:40:00Z"), "Africa/Gaborone")).toBe("24 Sep 2026 at 16:40");
    expect(formatMoment(new Date("2026-09-30T22:05:00Z"), "Africa/Gaborone")).toBe("1 Oct 2026 at 00:05");
  });
});

describe("addMonths", () => {
  const d = (s: string) => parseDateOnly(s)!;
  it("keeps the day, or clamps to the month's end", () => {
    expect(toDateOnly(addMonths(d("2026-01-15"), 1))).toBe("2026-02-15");
    expect(toDateOnly(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toDateOnly(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(toDateOnly(addMonths(d("2026-11-30"), 3))).toBe("2027-02-28");
    expect(toDateOnly(addMonths(d("2026-03-31"), -1))).toBe("2026-02-28");
    expect(toDateOnly(addMonths(d("2026-09-27"), 12))).toBe("2027-09-27");
  });

  it("counts days between dates", () => {
    expect(daysBetween(d("2026-09-01"), d("2026-10-01"))).toBe(30);
    expect(daysBetween(d("2026-10-01"), d("2026-09-01"))).toBe(-30);
  });
});
