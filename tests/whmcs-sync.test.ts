import { describe, expect, it } from "vitest";
import { WhmcsClient } from "../src/server/billing/whmcs/client";
import { describeReport, planSync, runSync, signSync, syncUrlFor, type SyncDeps, type SyncResult } from "../src/server/billing/whmcs/price-sync";
import type { StaffActor } from "../src/server/staff/access";
import { FAKE_CREDENTIALS, fakeWhmcs } from "./fake-whmcs";

const NOW = new Date("2026-09-29T08:00:00Z");
const ADMIN: StaffActor = { userId: "staff-1", name: "Kabo Admin", staffRole: "ADMIN" };
const SECRET = "test-secret-that-is-at-least-32-chars";

/** An in-memory stand-in for the tables the sync reads and writes. */
function fakeDb(over: { zwEnabled?: boolean; zwPrice?: bigint } = {}) {
  const markets = [
    { code: "bw", name: "Botswana", currency: "BWP", timeZone: "Africa/Gaborone", enabled: true, sortOrder: 1 },
    { code: "zw", name: "Zimbabwe", currency: "USD", timeZone: "Africa/Harare", enabled: over.zwEnabled ?? false, sortOrder: 2 },
    { code: "global", name: "International", currency: "USD", timeZone: "UTC", enabled: over.zwEnabled ?? false, sortOrder: 3 },
  ];
  const product = (slug: string, name: string, perUser: boolean, markets: string[]) => ({ slug, name, summary: `${name}, managed by us.`, quantityAllowed: perUser, markets, active: true });
  const categories = [
    { key: "productivity", name: "Productivity", description: "Email, Office and Teams", products: [product("m365-standard", "Microsoft 365 Business Standard", true, ["bw", "zw", "global"]), product("m365-copilot", "Microsoft 365 Copilot", true, [])] },
    { key: "servers", name: "Servers", description: "Managed servers", products: [product("vps-medium", "Managed VPS, medium", false, ["bw"])] },
  ];
  const entry = (marketCode: string, item: string, currency: string, amountMinor: bigint, renewMinor: bigint | null = null) => ({ marketCode, item, month: "2026-09", currency, amountMinor, renewMinor });
  const book = [
    entry("bw", "product:m365-standard", "BWP", 19000n),
    entry("zw", "product:m365-standard", "USD", 1250n),
    entry("global", "product:m365-standard", "USD", over.zwPrice ?? 1250n),
    entry("bw", "product:vps-medium", "BWP", 85000n),
    entry("bw", "tld:.co.bw", "BWP", 25000n, 22000n),
  ];
  const links: { kind: string; key: string; whmcsId: string }[] = [];
  const productIds: Record<string, string> = {};
  const audits: { data: Record<string, unknown> }[] = [];
  const db = {
    market: { findMany: async ({ where }: { where: { enabled: boolean } }) => markets.filter((m) => m.enabled === where.enabled) },
    productCategory: { findMany: async () => categories },
    whmcsLink: {
      findMany: async () => links,
      upsert: async ({ create }: { create: { kind: string; key: string; whmcsId: string } }) => {
        const found = links.find((l) => l.kind === create.kind && l.key === create.key);
        if (found) found.whmcsId = create.whmcsId;
        else links.push({ ...create });
      },
    },
    tld: { findMany: async () => [{ tld: ".co.bw", markets: ["bw"] }] },
    priceBookEntry: { findMany: async ({ where }: { where: { marketCode: string } }) => book.filter((b) => b.marketCode === where.marketCode) },
    product: { update: async ({ where, data }: { where: { slug: string }; data: { billingProductId: string } }) => void (productIds[where.slug] = data.billingProductId) },
    staffAuditEvent: { create: async (row: { data: Record<string, unknown> }) => void audits.push(row) },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db),
  };
  return { db: db as unknown as SyncDeps["db"], links, productIds, audits };
}

/** A stand-in for the addon: checks the signature like Guard does, and answers as it would. */
function fakeAddon(secret = SECRET) {
  const seen = new Set<string>();
  const requests: { dryRun: boolean; operations: { ref: string; op: string; id: string | null }[] }[] = [];
  let next = 50;
  const fetcher = (async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);
    const ok = headers["x-console-signature"] === signSync(secret, headers["x-console-timestamp"], headers["x-console-request-id"], body) && !seen.has(headers["x-console-request-id"]);
    seen.add(headers["x-console-request-id"]);
    if (!ok) return new Response(JSON.stringify({ ok: false, error: "the signature does not match" }), { status: 401 });
    const request = JSON.parse(body);
    requests.push(request);
    const results: SyncResult[] = request.operations.map((op: { ref: string; op: "group" | "product"; id: string | null; name: string }) => ({
      ref: op.ref,
      kind: op.op,
      id: op.id ?? (request.dryRun ? null : String(next++)),
      name: op.name,
      created: !op.id,
      changes: [],
    }));
    return new Response(JSON.stringify({ ok: true, dryRun: request.dryRun, results }));
  }) as unknown as typeof fetch;
  return { fetcher, requests };
}

function deps(db: SyncDeps["db"], addon = fakeAddon(), whmcs = fakeWhmcs()) {
  return { deps: { db, whmcs: new WhmcsClient(FAKE_CREDENTIALS, whmcs.fetcher), syncUrl: syncUrlFor(FAKE_CREDENTIALS.url), syncSecret: SECRET, fetcher: addon.fetcher, now: () => NOW }, whmcs, addon };
}

describe("WHMCS price sync", () => {
  it("plans groups and products from the approved price books", async () => {
    const { db } = fakeDb();
    const plan = await planSync(db, NOW);
    expect(plan.problems).toEqual([]);
    expect(plan.operations).toEqual([
      { op: "group", ref: "category:productivity", id: null, name: "Productivity", headline: "Email, Office and Teams", hidden: false },
      { op: "product", ref: "product:m365-standard", id: null, group: "@category:productivity", name: "Microsoft 365 Business Standard", description: "Microsoft 365 Business Standard, managed by us.", hidden: false, perUser: true, prices: { BWP: "190.00" } },
      { op: "group", ref: "category:servers", id: null, name: "Servers", headline: "Managed servers", hidden: false },
      { op: "product", ref: "product:vps-medium", id: null, group: "@category:servers", name: "Managed VPS, medium", description: "Managed VPS, medium, managed by us.", hidden: false, perUser: false, prices: { BWP: "850.00" } },
    ]);
    expect(plan.tlds).toEqual([{ tld: ".co.bw", currency: "BWP", register: { amountMinor: 25000n, currency: "BWP" }, renew: { amountMinor: 22000n, currency: "BWP" } }]);
  });

  it("takes one price per currency, and stops when two markets disagree", async () => {
    expect((await planSync(fakeDb({ zwEnabled: true }).db, NOW)).operations[1]).toMatchObject({ prices: { BWP: "190.00", USD: "12.50" } });
    const plan = await planSync(fakeDb({ zwEnabled: true, zwPrice: 1300n }).db, NOW);
    expect(plan.problems).toEqual([expect.stringMatching(/Microsoft 365 Business Standard: Zimbabwe and International are both in USD but approved different prices \(12\.50 and 13\.00\)/)]);
    const { deps: d, addon } = deps(fakeDb({ zwEnabled: true, zwPrice: 1300n }).db);
    const report = await runSync(d, { apply: true, staff: ADMIN });
    expect(report.applied).toBe(false);
    expect(addon.requests).toEqual([]);
    expect(describeReport(report)[0]).toBe("Nothing was sent to WHMCS, because:");
  });

  it("is a dry run unless applied, and changes nothing in the console", async () => {
    const { db, links, audits } = fakeDb();
    const { deps: d, addon, whmcs } = deps(db);
    const report = await runSync(d, { apply: false });
    expect(addon.requests[0].dryRun).toBe(true);
    expect(report.tldChanges).toEqual([".co.bw BWP: register 250.00 to 250.00, renew 250.00 to 220.00"]);
    expect(whmcs.calls.some((c) => c.action === "CreateOrUpdateTLD")).toBe(false);
    expect(links).toEqual([]);
    expect(audits).toEqual([]);
    expect(describeReport(report)).toContain('  Would create product "Managed VPS, medium"');
  });

  it("applies the changes, links the WHMCS ids and writes one staff audit entry", async () => {
    const { db, links, productIds, audits } = fakeDb();
    const { deps: d, addon, whmcs } = deps(db);
    const report = await runSync(d, { apply: true, staff: ADMIN });
    expect(report.applied).toBe(true);
    expect(addon.requests[0].dryRun).toBe(false);
    expect(links).toEqual([
      { kind: "group", key: "productivity", whmcsId: "50" },
      { kind: "product", key: "m365-standard", whmcsId: "51" },
      { kind: "group", key: "servers", whmcsId: "52" },
      { kind: "product", key: "vps-medium", whmcsId: "53" },
    ]);
    expect(productIds).toEqual({ "m365-standard": "51", "vps-medium": "53" });
    expect(whmcs.calls.find((c) => c.action === "CreateOrUpdateTLD")?.params).toMatchObject({ extension: ".co.bw", currency_code: "BWP", "register[1]": "250.00", "register[2]": "500.00", "renew[1]": "220.00", "transfer[1]": "250.00" });
    expect(audits).toHaveLength(1);
    expect(audits[0].data).toMatchObject({ actorUserId: "staff-1", actorLabel: "Kabo Admin", action: "whmcs.price-sync", summary: "Synced prices to WHMCS: 4 catalogue items and 1 domain ending changed" });

    // The next run updates the same WHMCS items, and finds the TLD already right.
    const again = await runSync(deps(db, addon, whmcs).deps, { apply: false });
    expect(addon.requests[1].operations.map((o) => o.id)).toEqual(["50", "51", "52", "53"]);
    expect(addon.requests[1].operations[1]).toMatchObject({ group: "50" });
    expect(again.tldChanges).toEqual([]);
  });

  it("hides a synced product that is no longer offered anywhere", async () => {
    const { db, links } = fakeDb();
    links.push({ kind: "group", key: "productivity", whmcsId: "7" }, { kind: "product", key: "m365-copilot", whmcsId: "8" });
    const plan = await planSync(db, NOW);
    expect(plan.operations.find((o) => o.ref === "product:m365-copilot")).toMatchObject({ id: "8", group: "7", hidden: true, prices: {} });
  });

  it("only lets staff who manage pricing apply it", async () => {
    const { deps: d, addon } = deps(fakeDb().db);
    await expect(runSync(d, { apply: true, staff: { ...ADMIN, staffRole: "SUPPORT" } })).rejects.toThrow();
    expect(addon.requests).toEqual([]);
  });

  it("reports the addon's refusal", async () => {
    const { deps: d } = deps(fakeDb().db, fakeAddon("another-secret-of-at-least-32-chars!!"));
    await expect(runSync(d, { apply: false })).rejects.toThrow(/refused the request \(HTTP 401\): the signature does not match/);
  });

  it("signs exactly as the addon does (the same vector is in whmcs/tests/run.php)", () => {
    expect(signSync(SECRET, "1790000000", "0123456789abcdef0123456789abcdef", '{"operations":[]}')).toBe("v1=5c4bedec0e12267fa5ba28250c754f2bca6cb87534c1e72fc8a29d893106708d");
    expect(syncUrlFor("https://billing.fourthgeneration.technology/includes/api.php")).toBe("https://billing.fourthgeneration.technology/modules/addons/fourthgen_console/sync.php");
  });
});
