import { createHmac, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { todayIn } from "@/lib/dates";
import { money, type Money } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { bookFor, offeredIn, productItem, tldItem } from "@/server/catalogue/price-book";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { effectiveStatus } from "@/server/catalogue/visibility";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import type { WhmcsClient } from "./client";
import * as map from "./map";

/**
 * Keeps WHMCS's catalogue the same as the console's approved price books,
 * so nobody sets products or prices up by hand in WHMCS:
 * - product groups and products, with their monthly price per currency,
 *   through the Fourth Generation Console Sync addon (WHMCS's API can't
 *   update a product), which only accepts signed, fresh, unseen requests
 *   from allowed addresses (whmcs/modules/addons/fourthgen_console);
 * - domain endings, through the API's CreateOrUpdateTLD.
 *
 * A dry run by default: it shows what would change. Applying needs a staff
 * member allowed to manage pricing, and writes one staff audit entry
 * listing every change. Customers are never charged WHMCS's catalogue
 * prices (orders send ours), so this only keeps WHMCS's own pages right.
 */

type Db = Pick<PrismaClient, "market" | "product" | "productCategory" | "priceBookEntry" | "tld" | "whmcsLink" | "staffAuditEvent" | "$transaction">;

export interface GroupOperation {
  op: "group";
  ref: string;
  id: string | null;
  name: string;
  headline: string;
  hidden: boolean;
}

export interface ProductOperation {
  op: "product";
  ref: string;
  id: string | null;
  /** A WHMCS group id, or "@" and a group operation's ref. */
  group: string;
  name: string;
  description: string;
  hidden: boolean;
  perUser: boolean;
  /** Currency code to monthly price per unit, "190.00". */
  prices: Record<string, string>;
}

export interface TldPlan {
  tld: string;
  currency: string;
  register: Money;
  renew: Money;
}

export interface SyncPlan {
  operations: (GroupOperation | ProductOperation)[];
  tlds: TldPlan[];
  /** Reasons the sync can't run; nothing is sent while there are any. */
  problems: string[];
}

export interface SyncResult {
  ref: string;
  kind: "group" | "product";
  id: string | null;
  name: string;
  created: boolean;
  changes: string[];
}

export interface SyncReport {
  plan: SyncPlan;
  applied: boolean;
  results: SyncResult[];
  tldChanges: string[];
}

const groupRef = (key: string) => `category:${key}`;

/** What WHMCS should hold, from the price books in effect this month in each enabled market. */
export async function planSync(db: Db, now = new Date()): Promise<SyncPlan> {
  const [markets, categories, links, tlds] = await Promise.all([
    db.market.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ orderBy: [{ family: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { family: true, products: { where: { slug: { not: DOMAIN_PRODUCT_SLUG } }, orderBy: { sortOrder: "asc" } } } }),
    db.whmcsLink.findMany(),
    db.tld.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const linked = (kind: string, key: string) => links.find((l) => l.kind === kind && l.key === key)?.whmcsId ?? null;
  const books = await Promise.all(markets.map(async (m) => ({ market: m, book: await bookFor(db, m.code, monthOf(todayIn(m.timeZone, now))) })));
  const problems: string[] = [];

  /** One price per currency: markets sharing a currency must agree. */
  function perCurrency(item: string, what: string, sold: (code: string) => boolean, pick: (e: { amountMinor: bigint; renewMinor: bigint | null }) => bigint | null) {
    const prices = new Map<string, { amount: bigint; market: string }>();
    for (const { market, book } of books) {
      const entry = book.get(item);
      const amount = entry && entry.currency === market.currency && sold(market.code) ? pick(entry) : null;
      if (amount == null) continue;
      const other = prices.get(market.currency);
      if (other && other.amount !== amount) {
        problems.push(`${what}: ${other.market} and ${market.name} are both in ${market.currency} but approved different prices (${map.toAmount(money(other.amount, market.currency))} and ${map.toAmount(money(amount, market.currency))}). WHMCS holds one ${market.currency} price, so approve the same price in both, or switch one market off.`);
        continue;
      }
      prices.set(market.currency, { amount, market: other?.market ?? market.name });
    }
    return new Map([...prices].map(([currency, p]) => [currency, money(p.amount, currency)]));
  }

  const operations: (GroupOperation | ProductOperation)[] = [];
  for (const category of categories) {
    const groupId = linked("group", category.key);
    const products: ProductOperation[] = [];
    for (const product of category.products) {
      const productId = linked("product", product.slug);
      // Live products are shown in WHMCS and internal ones hidden (staff can
      // still order them); drafts aren't sent, and one sent before is hidden.
      const status = effectiveStatus(product, category.family);
      if (status === "DRAFT" && !productId) continue;
      const withFamily = { ...product, category };
      const prices = status === "DRAFT" ? new Map<string, Money>() : perCurrency(productItem(product.slug), product.name, (code) => offeredIn(withFamily, code, "internal"), (e) => e.amountMinor);
      // Never offered and never synced: nothing to put in WHMCS yet.
      if (!prices.size && !productId) continue;
      products.push({
        op: "product",
        ref: `product:${product.slug}`,
        id: productId,
        group: groupId ?? `@${groupRef(category.key)}`,
        name: product.name,
        description: product.summary,
        hidden: status !== "LIVE" || !prices.size,
        perUser: product.quantityAllowed,
        prices: Object.fromEntries([...prices].map(([currency, m]) => [currency, map.toAmount(m)])),
      });
    }
    if (!products.length) continue;
    operations.push({ op: "group", ref: groupRef(category.key), id: groupId, name: category.name, headline: category.description, hidden: products.every((p) => p.hidden) });
    operations.push(...products);
  }

  const tldPlans: TldPlan[] = [];
  for (const t of tlds) {
    const item = tldItem(t.tld);
    const registers = perCurrency(item, t.tld, (code) => t.markets.includes(code), (e) => e.amountMinor);
    const renewals = perCurrency(item, `${t.tld} renewal`, (code) => t.markets.includes(code), (e) => e.renewMinor);
    for (const [currency, register] of registers) {
      const renew = renewals.get(currency);
      if (renew) tldPlans.push({ tld: t.tld, currency, register, renew });
    }
  }
  return { operations, tlds: tldPlans, problems };
}

/** The addon's signature: HMAC-SHA256 over "v1", the timestamp, the request id and the body. Matches Guard::sign in the addon. */
export function signSync(secret: string, timestamp: string, requestId: string, body: string) {
  return `v1=${createHmac("sha256", secret).update(`v1\n${timestamp}\n${requestId}\n${body}`).digest("hex")}`;
}

/** The addon's endpoint beside the API, unless WHMCS_SYNC_URL says otherwise. */
export const syncUrlFor = (apiUrl: string) => apiUrl.replace(/\/includes\/api\.php$/, "/modules/addons/fourthgen_console/sync.php");

export interface SyncDeps {
  db: Db;
  whmcs: WhmcsClient;
  syncUrl: string;
  syncSecret: string;
  fetcher?: typeof fetch;
  now?: () => Date;
}

/** Sends one signed request to the addon. */
async function sendToAddon(deps: SyncDeps, operations: SyncPlan["operations"], dryRun: boolean): Promise<SyncResult[]> {
  const body = JSON.stringify({ dryRun, operations });
  const timestamp = String(Math.floor((deps.now?.() ?? new Date()).getTime() / 1000));
  const requestId = randomBytes(16).toString("hex");
  const res = await (deps.fetcher ?? fetch)(deps.syncUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-console-timestamp": timestamp, "x-console-request-id": requestId, "x-console-signature": signSync(deps.syncSecret, timestamp, requestId, body) },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const answer = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; results?: SyncResult[] } | null;
  if (!answer?.ok || !answer.results) throw new Error(`The WHMCS sync addon refused the request (HTTP ${res.status}): ${answer?.error ?? "no answer it could read"}.`);
  return answer.results;
}

/** Each TLD price in WHMCS that differs from the plan, as a sentence. */
async function tldDifferences(whmcs: WhmcsClient, plans: TldPlan[]) {
  const currencies = map.fromCurrencies(await whmcs.call("GetCurrencies", {}, { read: true }));
  const differences: { plan: TldPlan; change: string }[] = [];
  for (const code of [...new Set(plans.map((p) => p.currency))]) {
    const currency = currencies.find((c) => c.code === code);
    if (!currency) throw new Error(`WHMCS has no ${code} currency. Add it (docs/whmcs-setup.md, step 1).`);
    const current = map.fromTldPricing(await whmcs.call("GetTLDPricing", map.by.currency(currency.id), { read: true }), code);
    for (const plan of plans.filter((p) => p.currency === code)) {
      const now = current.find((t) => t.tld === plan.tld);
      const same = (a: Money | undefined, b: Money) => a?.amountMinor === b.amountMinor;
      if (!now) differences.push({ plan, change: `add ${plan.tld} at ${map.toAmount(plan.register)} ${code} a year` });
      else if (!same(now.register, plan.register) || !same(now.renew, plan.renew) || !same(now.transfer, plan.register)) {
        differences.push({ plan, change: `${plan.tld} ${code}: register ${map.toAmount(now.register)} to ${map.toAmount(plan.register)}, renew ${map.toAmount(now.renew)} to ${map.toAmount(plan.renew)}` });
      }
    }
  }
  return differences;
}

/**
 * Works out the plan and what it would change in WHMCS. With `apply` and a
 * staff member allowed to manage pricing, it makes the changes, records
 * the WHMCS ids, and writes the staff audit entry.
 */
export async function runSync(deps: SyncDeps, options: { apply: false } | { apply: true; staff: StaffActor }): Promise<SyncReport> {
  if (options.apply) assertStaffCan(options.staff, "managePricing");
  const plan = await planSync(deps.db, deps.now?.());
  if (plan.problems.length) return { plan, applied: false, results: [], tldChanges: [] };

  const results = plan.operations.length ? await sendToAddon(deps, plan.operations, !options.apply) : [];
  const tlds = plan.tlds.length ? await tldDifferences(deps.whmcs, plan.tlds) : [];
  const tldChanges = tlds.map((t) => t.change);
  if (!options.apply) return { plan, applied: false, results, tldChanges };

  for (const { plan: t } of tlds) await deps.whmcs.call("CreateOrUpdateTLD", map.toTldPricing(t.tld, t.register, t.renew));

  const changed = results.filter((r) => r.created || r.changes.length);
  await deps.db.$transaction(async (tx) => {
    for (const r of results) {
      if (!r.id) continue;
      const [kind, key] = [r.kind, r.ref.slice(r.ref.indexOf(":") + 1)];
      await tx.whmcsLink.upsert({ where: { kind_key: { kind, key } }, create: { kind, key, whmcsId: r.id }, update: { whmcsId: r.id } });
      if (kind === "product") await tx.product.update({ where: { slug: key }, data: { billingProductId: r.id } });
    }
    if (changed.length || tldChanges.length) {
      await tx.staffAuditEvent.create({
        data: {
          actorUserId: options.staff.userId,
          actorLabel: staffLabel(options.staff),
          action: "whmcs.price-sync",
          summary: `Synced prices to WHMCS: ${changed.length} catalogue ${changed.length === 1 ? "item" : "items"} and ${tldChanges.length} domain ${tldChanges.length === 1 ? "ending" : "endings"} changed`,
          data: {
            changes: changed.map((r) => ({ ref: r.ref, whmcsId: r.id, created: r.created, changes: r.changes })),
            tlds: tldChanges,
          },
        },
      });
    }
  });
  return { plan, applied: true, results, tldChanges };
}

/** The report as lines for the command line. */
export function describeReport(report: SyncReport): string[] {
  if (report.plan.problems.length) return ["Nothing was sent to WHMCS, because:", ...report.plan.problems.map((p) => `  - ${p}`)];
  const verb = report.applied ? { created: "Created", updated: "Updated" } : { created: "Would create", updated: "Would update" };
  const lines = report.results.filter((r) => r.created || r.changes.length).map((r) => `  ${r.created ? verb.created : verb.updated} ${r.kind} "${r.name}"${r.changes.length ? `: ${r.changes.join("; ")}` : ""}`);
  lines.push(...report.tldChanges.map((c) => `  ${report.applied ? "Set" : "Would set"} ${c}`));
  if (!lines.length) return ["WHMCS already matches the price books."];
  return [report.applied ? "Changed in WHMCS:" : "Dry run. Run with --apply to make these changes:", ...lines];
}
