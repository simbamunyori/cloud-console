import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { approveRun, buildMonth, retrySync, runChanges, type SyncActor } from "../src/server/pricing/monthly";
import {
  acceptTable,
  allRatesToday,
  checkRates,
  latestTable,
  parseAllRatesToday,
  parseDecimal,
  rateMicros,
  RateFetchError,
  type PublishedTable,
  type RateSource,
} from "../src/server/pricing/official-rates";
import { TEMPLATES } from "../src/server/email/templates";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, uniqueEmail } from "./helpers";

// Bank of Botswana prints "1 BWP = x"; USD to BWP is the inverse.
describe("rates from a Bank of Botswana table", () => {
  const table = [
    { base: "BWP", quote: "USD", value: "0.0742" },
    { base: "BWP", quote: "ZAR", value: "1.3125" },
  ];

  it("reads published decimals exactly", () => {
    expect(parseDecimal("0.0742")).toEqual({ n: 742n, d: 10000n });
    expect(parseDecimal("0")).toBeNull();
    expect(parseDecimal("-1.2")).toBeNull();
    expect(parseDecimal("1e-7")).toBeNull();
  });

  it("inverts and crosses through the pula", () => {
    // 1 / 0.0742 = 13.477088...
    expect(rateMicros(table, "USD", "BWP")).toBe(13_477_089n);
    expect(rateMicros(table, "BWP", "USD")).toBe(74_200n);
    // 1.3125 / 0.0742 = 17.688679...
    expect(rateMicros(table, "USD", "ZAR")).toBe(17_688_679n);
    expect(rateMicros([{ base: "USD", quote: "BWP", value: "13.45" }], "USD", "BWP")).toBe(13_450_000n);
    expect(rateMicros(table, "EUR", "BWP")).toBeNull();
  });

  it("keeps only what Bank of Botswana published from AllRatesToday's answer", () => {
    const parsed = parseAllRatesToday({
      rate_date: "2026-10-02",
      rates: [
        { base: "BWP", quote: "USD", type: "reference", value: 0.0742 },
        { base: "USD", quote: "BWP", type: "reference", value: 13.477, derived: true },
        { base: "USD", quote: "ZAR", value: 17.7 },
        { base: "BWP", quote: "ZAR", value: "1.3125" },
        { base: "BWP", quote: "EUR", value: "nonsense" },
      ],
    });
    expect(parsed).toEqual({ publishedOn: "2026-10-02", rates: [{ base: "BWP", quote: "USD", value: "0.0742" }, { base: "BWP", quote: "ZAR", value: "1.3125" }] });
    expect(() => parseAllRatesToday({ rates: [] })).toThrow(RateFetchError);
  });

  it("sends the key only in the header and says what went wrong without it", async () => {
    const seen: RequestInit[] = [];
    const answer = (status: number) => async (_url: unknown, init?: RequestInit) => {
      seen.push(init!);
      return new Response(JSON.stringify({ error: "x" }), { status });
    };
    await expect(allRatesToday("art_live_secret", answer(401) as typeof fetch).latest()).rejects.toThrow(/ALLRATESTODAY_API_KEY/);
    await expect(allRatesToday("art_live_secret", answer(429) as typeof fetch).latest()).rejects.toThrow(/allowance/);
    const err = await allRatesToday("art_live_secret", (async () => { throw new Error("ECONNRESET"); }) as typeof fetch).latest().catch((e) => e);
    expect(err).toBeInstanceOf(RateFetchError);
    expect(err.message).not.toContain("art_live_secret");
    expect((seen[0].headers as Record<string, string>).authorization).toBe("Bearer art_live_secret");
  });
});

// The monthly scenario runs in 2031 so it never meets other tests' months.
describe.skipIf(!hasDb)("daily rates and the monthly price book", () => {
  const at = (iso: string) => () => new Date(iso);
  const usd = (bwpPerUsd: string) => ({ base: "USD", quote: "BWP", value: bwpPerUsd });
  const table = (publishedOn: string, bwpPerUsd: string): PublishedTable => ({ publishedOn, rates: [usd(bwpPerUsd), { base: "BWP", quote: "ZAR", value: "1.35" }] });
  const source = (...answers: (PublishedTable | Error)[]): RateSource => ({
    name: "test",
    latest: vi.fn(async () => {
      const next = answers.length > 1 ? answers.shift()! : answers[0];
      if (next instanceof Error) throw next;
      return next;
    }),
  });
  const noSleep = { sleep: async () => undefined };
  let admin: StaffActor;
  let original: { autoApproveBps: number; currencyBufferBps: number };

  async function cleanUp() {
    await db.priceBookEntry.deleteMany({ where: { month: { startsWith: "2031-" } } });
    await db.priceBookRun.deleteMany({ where: { month: { startsWith: "2031-" } } });
    await db.officialRateTable.deleteMany({ where: { publishedOn: { gte: new Date("2031-01-01") } } });
    await db.fxRate.deleteMany({ where: { month: { startsWith: "2031-" } } });
    await db.pricingAlert.deleteMany({ where: { key: { contains: "2031-" } } });
  }

  beforeAll(async () => {
    await cleanUp();
    const user = await db.user.create({ data: { kind: "STAFF", staffRole: "ADMIN", email: uniqueEmail("staff"), name: "Kagiso Admin", passwordHash: "x", totpEnabled: true } });
    admin = { userId: user.id, name: user.name, staffRole: "ADMIN" };
    const s = await db.pricingSettings.findUniqueOrThrow({ where: { id: "global" } });
    original = { autoApproveBps: s.autoApproveBps, currencyBufferBps: s.currencyBufferBps };
  });

  afterAll(async () => {
    await db.pricingSettings.update({ where: { id: "global" }, data: { autoApproveBps: original.autoApproveBps, ratesError: null } });
    await cleanUp();
  });

  const alertsTo = (kind: string, after: Date) => db.outboundEmail.count({ where: { kind, toAddress: { startsWith: "staff+" }, createdAt: { gte: after } } });

  it("stores a day's table with its publication date, retrying a failed fetch", async () => {
    const src = source(new RateFetchError("AllRatesToday didn't answer."), table("2031-01-30", "13.80"));
    const result = await checkRates({ db, source: src, now: at("2031-01-30T08:00:00Z"), ...noSleep });
    expect(result.kind).toBe("stored");
    expect(src.latest).toHaveBeenCalledTimes(2);
    const stored = await latestTable(db, new Date("2031-01-31"));
    expect(stored?.publishedOn.toISOString().slice(0, 10)).toBe("2031-01-30");
    expect(stored?.rates.find((r) => r.base === "USD")?.value).toBe("13.80");
    // The same table again changes nothing.
    expect((await checkRates({ db, source: source(table("2031-01-30", "13.80")), now: at("2031-01-30T12:00:00Z"), ...noSleep })).kind).toBe("unchanged");
  });

  it("keeps the previous rates and alerts once a day when every try fails", async () => {
    const before = new Date();
    const src = source(new RateFetchError("AllRatesToday answered HTTP 500."));
    const result = await checkRates({ db, source: src, now: at("2031-01-31T08:00:00Z"), ...noSleep });
    expect(result).toEqual({ kind: "failed", error: "AllRatesToday answered HTTP 500." });
    expect(src.latest).toHaveBeenCalledTimes(3);
    expect((await db.pricingSettings.findUniqueOrThrow({ where: { id: "global" } })).ratesError).toMatch(/HTTP 500/);
    await checkRates({ db, source: src, now: at("2031-01-31T12:00:00Z"), ...noSleep });
    expect(await db.pricingAlert.count({ where: { key: "fetch-failed:2031-01-31" } })).toBe(1);
    expect(await alertsTo("pricing.alert", before)).toBeGreaterThan(0);
    expect((await latestTable(db, new Date("2031-01-31")))?.publishedOn.toISOString().slice(0, 10)).toBe("2031-01-30");
  });

  it("never stores a broken table", async () => {
    const result = await checkRates({ db, source: source({ publishedOn: "2031-01-31", rates: [{ base: "BWP", quote: "ZAR", value: "1.35" }] }), now: at("2031-02-01T02:00:00Z"), ...noSleep });
    expect(result.kind).toBe("failed");
    expect(await db.officialRateTable.count({ where: { publishedOn: new Date("2031-01-31") } })).toBe(0);
  });

  it("auto-approves the month within the threshold, syncs as the system and audits it", async () => {
    await db.pricingSettings.update({ where: { id: "global" }, data: { autoApproveBps: 5_000 } });
    const sync = vi.fn<(a: SyncActor) => Promise<void>>().mockRejectedValueOnce(new Error("The WHMCS sync addon refused the request (HTTP 403)."));
    const run = (await buildMonth({ db, sync, now: at("2031-02-01T04:00:00Z") }))!;
    expect(run.month).toBe("2031-02");
    const changes = runChanges(run);
    expect(changes.length).toBeGreaterThan(0);
    expect(run.status).toBe("APPLIED");
    expect(run.maxChangeBps).toBeLessThanOrEqual(5_000);
    expect(run.approvedById).toBeNull();
    // The month's rate, from the table, with its source date.
    const rate = await db.fxRate.findUniqueOrThrow({ where: { month_base_quote: { month: "2031-02", base: "USD", quote: "BWP" } } });
    expect(rate).toMatchObject({ rateMicros: 13_800_000n, source: "bob", setById: null });
    expect(rate.sourceDate?.toISOString().slice(0, 10)).toBe("2031-01-30");
    // Every change is in the book from the month, marked as from this run.
    const entries = await db.priceBookEntry.findMany({ where: { month: "2031-02", runId: run.id } });
    expect(entries).toHaveLength(changes.length);
    expect(entries.every((e) => e.approvedById === null)).toBe(true);
    const audit = await db.staffAuditEvent.findFirstOrThrow({ where: { action: "pricing.auto-approved", summary: { contains: "February 2031" } }, orderBy: { createdAt: "desc" } });
    expect(audit).toMatchObject({ actorUserId: "system", actorLabel: "Automatic pricing" });
    expect(audit.summary).toMatch(/Bank of Botswana, published \w+ 30 January 2031: .*1 USD = 13\.8 BWP/);
    // WHMCS refused, so it's recorded and tried again later.
    expect(sync).toHaveBeenCalledWith({ system: "Automatic pricing" });
    expect(run.syncError).toMatch(/HTTP 403/);
    expect(await db.pricingAlert.count({ where: { key: "sync-failed:2031-02:2031-02-01" } })).toBe(1);
    const retried = await retrySync({ db, sync, now: at("2031-02-01T08:00:00Z") });
    expect(retried?.syncedAt).toBeTruthy();
    // Building again does nothing.
    expect((await buildMonth({ db, sync, now: at("2031-02-01T08:00:00Z") }))?.id).toBe(run.id);
  });

  it("waits, and says so, when the newest table is too old on the 1st", async () => {
    expect(await buildMonth({ db, now: at("2031-03-01T04:00:00Z") })).toBeNull();
    expect(await db.priceBookRun.count({ where: { month: "2031-03" } })).toBe(0);
    expect(await db.pricingAlert.count({ where: { key: "build-waiting:2031-03:2031-03-01" } })).toBe(1);
    // Prices stay as they were.
    expect(await db.priceBookEntry.count({ where: { month: "2031-03" } })).toBe(0);
  });

  it("asks an Admin over the threshold, applies nothing until they approve, then logs the approval", async () => {
    await db.pricingSettings.update({ where: { id: "global" }, data: { autoApproveBps: 0 } });
    await checkRates({ db, source: source(table("2031-03-28", "14.10")), now: at("2031-03-28T08:00:00Z"), ...noSleep });
    const before = new Date();
    const run = (await buildMonth({ db, now: at("2031-04-01T04:00:00Z") }))!;
    expect(run.status).toBe("AWAITING_APPROVAL");
    expect(runChanges(run).length).toBeGreaterThan(0);
    expect(await db.priceBookEntry.count({ where: { month: "2031-04" } })).toBe(0);
    expect(await alertsTo("pricing.approval_needed", before)).toBeGreaterThan(0);
    expect(await db.staffAuditEvent.count({ where: { action: "pricing.approval-requested", summary: { contains: "April 2031" }, createdAt: { gte: before } } })).toBe(1);

    // The email names the biggest changes and links to the page with the one button.
    const email = await TEMPLATES["pricing.approval_needed"]({ month: "2031-04" }, { db, appUrl: "https://console.example", consoleName: "Cloud Console", now: new Date(), locale: "en-BW", timeZone: "Africa/Gaborone" });
    expect(email?.subject).toBe("April 2031 prices need your approval");
    expect(email?.body.button?.url).toBe("https://console.example/admin/pricing/months/2031-04");
    expect(email?.body.facts?.length).toBeGreaterThan(0);

    const finance = { ...admin, staffRole: "FINANCE" as const };
    await expect(approveRun({ db, staff: admin, now: at("2031-05-02T08:00:00Z") }, "2031-04")).rejects.toThrow(/has ended/);
    await expect(approveRun({ db, staff: finance, now: at("2031-04-02T08:00:00Z") }, "2031-04")).rejects.toThrow(/staff role/);

    const sync = vi.fn<(a: SyncActor) => Promise<void>>().mockResolvedValue();
    const approved = await approveRun({ db, staff: admin, sync, now: at("2031-04-02T08:00:00Z") }, "2031-04");
    expect(approved).toMatchObject({ status: "APPLIED", approvedById: admin.userId, approvedByName: "Kagiso Admin" });
    expect(approved.syncedAt).toBeTruthy();
    expect(sync).toHaveBeenCalledWith({ staff: admin });
    const entries = await db.priceBookEntry.findMany({ where: { month: "2031-04" } });
    expect(entries).toHaveLength(runChanges(run).length);
    expect(entries.every((e) => e.approvedById === admin.userId && e.runId === run.id)).toBe(true);
    expect(await db.pricingChange.count({ where: { userId: admin.userId, field: { endsWith: ":2031-04" } } })).toBe(entries.length);
    expect(await db.staffAuditEvent.count({ where: { action: "pricing.month-approved", actorUserId: admin.userId } })).toBe(1);
    // A second click changes nothing.
    await approveRun({ db, staff: admin, sync, now: at("2031-04-02T08:05:00Z") }, "2031-04");
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("keeps prices fixed mid-month and alerts once when the rate moves past the buffer", async () => {
    const buffer = (await db.pricingSettings.findUniqueOrThrow({ where: { id: "global" } })).currencyBufferBps;
    const book = () => db.priceBookEntry.findMany({ where: { month: { startsWith: "2031-" } }, orderBy: { id: "asc" } });
    const pricesBefore = await book();
    // 14.10 plus the buffer, and a bit more.
    const moved = ((14.1 * (10_000 + buffer + 100)) / 10_000).toFixed(4);
    await checkRates({ db, source: source(table("2031-04-14", moved)), now: at("2031-04-14T08:00:00Z"), ...noSleep });
    expect(await db.pricingAlert.count({ where: { key: "drift:2031-04:USD/BWP" } })).toBe(1);
    const drifts = () => db.pricingAlert.count({ where: { key: { startsWith: "drift:2031-04:" } } });
    const sent = await drifts();
    await checkRates({ db, source: source(table("2031-04-15", moved)), now: at("2031-04-15T08:00:00Z"), ...noSleep });
    expect(await drifts()).toBe(sent);
    expect(await book()).toEqual(pricesBefore);
  });

  it("holds back a table that jumps too far until an Admin accepts it", async () => {
    const result = await checkRates({ db, source: source(table("2031-04-16", "20.00")), now: at("2031-04-16T08:00:00Z"), ...noSleep });
    expect(result.kind).toBe("held-back");
    expect(await db.pricingAlert.count({ where: { key: "held-back:2031-04-16" } })).toBe(1);
    expect((await latestTable(db, new Date("2031-04-16")))?.publishedOn.toISOString().slice(0, 10)).toBe("2031-04-15");
    const held = await db.officialRateTable.findUniqueOrThrow({ where: { publishedOn: new Date("2031-04-16") } });
    await acceptTable({ db, staff: admin, now: at("2031-04-16T09:00:00Z") }, held.id);
    expect((await latestTable(db, new Date("2031-04-16")))?.id).toBe(held.id);
    expect(await db.staffAuditEvent.count({ where: { action: "pricing.rates-accepted", actorUserId: admin.userId } })).toBe(1);
  });
});
