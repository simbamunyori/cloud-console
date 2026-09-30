import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, parseDateOnly, toDateOnly } from "@/lib/dates";
import { applyBps, currencyInfo, divRound, isSupportedCurrency } from "@/lib/domain/money";
import { DomainError } from "@/server/org/access";
import { audit } from "@/server/org/audit";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { parseCsv } from "./csv";

/**
 * Azure usage, from files staff download from Partner Center (daily rated
 * usage) or from an Azure cost export, until the distributor's API is
 * signed. One file can cover many customers: each row is matched to a
 * customer by its Azure subscription id. Re-importing a day replaces it,
 * so a corrected file can simply be uploaded again.
 */

export const DEFAULT_MARGIN_BPS = 1500;
/** A month of daily usage for a few dozen customers fits well under this. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Column names each field is found under, compared without case, spaces or underscores. */
const COLUMNS = {
  // In Partner Center files the Azure subscription is the EntitlementId;
  // SubscriptionId there is the Azure plan. Cost exports call it SubscriptionId.
  subscription: ["entitlementid", "subscriptionid", "subscriptionguid"],
  day: ["usagedate", "date", "chargestartdate"],
  category: ["metercategory", "servicename"],
  cost: ["billingpretaxtotal", "costinbillingcurrency", "pretaxcost", "cost", "extendedcost"],
  currency: ["billingcurrency", "billingcurrencycode", "currency"],
  resourceId: ["resourceuri", "resourceid", "instanceid", "instancename"],
  resourceGroup: ["resourcegroup", "resourcegroupname"],
  resourceType: ["resourcetype", "consumedservice"],
} as const;

type Field = keyof typeof COLUMNS;
const REQUIRED: Field[] = ["subscription", "day", "category", "cost", "currency"];

const norm = (h: string) => h.toLowerCase().replace(/[\s_\-]/g, "");

export function mapColumns(header: string[]): Record<Field, number> {
  const seen = header.map(norm);
  const at = {} as Record<Field, number>;
  for (const field of Object.keys(COLUMNS) as Field[]) {
    at[field] = -1;
    for (const name of COLUMNS[field]) {
      const i = seen.indexOf(name);
      if (i >= 0) {
        at[field] = i;
        break;
      }
    }
  }
  const missing = REQUIRED.filter((f) => at[f] < 0);
  if (missing.length) {
    throw new DomainError("invalid", `This file has no ${missing.map((f) => COLUMN_LABEL[f]).join(", ")} column. Upload the daily rated usage file from Partner Center, or a cost export from Azure.`, "file");
  }
  return at;
}

const COLUMN_LABEL: Record<Field, string> = {
  subscription: "subscription (EntitlementId or SubscriptionId)",
  day: "date (UsageDate or Date)",
  category: "MeterCategory",
  cost: "cost (BillingPreTaxTotal or CostInBillingCurrency)",
  currency: "currency (BillingCurrency)",
  resourceId: "ResourceUri",
  resourceGroup: "ResourceGroup",
  resourceType: "ResourceType",
};

/** "2026-09-14", "2026-09-14T00:00:00Z", or Partner Center's "9/14/2026" (month first). */
export function parseUsageDay(value: string): Date | null {
  const v = value.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(v);
  if (iso) return parseDateOnly(iso[1]);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(v);
  if (us) return parseDateOnly(`${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`);
  return null;
}

/** A decimal amount in millionths, so many small rows add up without rounding each one. */
export function parseMicros(value: string): bigint | null {
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(value.trim().replace(/,/g, ""));
  if (!m || (!m[2] && !m[3])) return null;
  const frac = (m[3] ?? "").padEnd(7, "0");
  let micros = BigInt(m[2] || "0") * 1_000_000n + BigInt(frac.slice(0, 6));
  if (Number(frac[6]) >= 5) micros += 1n;
  return m[1] ? -micros : micros;
}

/** The parts of an Azure resource id: /subscriptions/…/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/web1. */
export function resourceParts(id: string): { group: string | null; type: string; name: string } {
  const group = /\/resourcegroups\/([^/]+)/i.exec(id)?.[1] ?? null;
  const provider = /\/providers\/([^/]+\/[^/]+)\/([^/]+)/i.exec(id);
  const name = id.split("/").filter(Boolean).pop() ?? "";
  return { group, type: provider?.[1] ?? "", name: provider?.[2] ?? name };
}

export interface UsageRow {
  subscription: string;
  day: Date;
  resourceGroup: string;
  resource: string;
  resourceType: string;
  category: string;
  micros: bigint;
  currency: string;
}

/** Reads a usage file into one row per subscription, day, resource and meter category. */
export function readUsageFile(text: string): { rows: UsageRow[]; rowsRead: number; skipped: number } {
  const table = parseCsv(text);
  if (table.length < 2) throw new DomainError("invalid", "This file has no usage rows.", "file");
  const at = mapColumns(table[0]);
  const rows = new Map<string, UsageRow>();
  let skipped = 0;
  for (const cells of table.slice(1)) {
    const get = (f: Field) => (at[f] >= 0 ? (cells[at[f]] ?? "").trim() : "");
    const subscription = get("subscription").toLowerCase();
    const day = parseUsageDay(get("day"));
    const micros = parseMicros(get("cost"));
    const currency = get("currency").toUpperCase();
    if (!subscription || !day || micros === null || !isSupportedCurrency(currency)) {
      skipped++;
      continue;
    }
    const parts = resourceParts(get("resourceId"));
    const row: UsageRow = {
      subscription,
      day,
      resourceGroup: (get("resourceGroup") || parts.group || "").toLowerCase(),
      resource: parts.name || "",
      resourceType: parts.type || get("resourceType"),
      category: get("category") || "Other",
      micros,
      currency,
    };
    const key = [row.subscription, toDateOnly(day), row.resourceGroup, row.resource.toLowerCase(), row.category].join("|");
    const had = rows.get(key);
    if (had) had.micros += micros;
    else rows.set(key, row);
  }
  return { rows: [...rows.values()], rowsRead: table.length - 1, skipped };
}

/**
 * What the customer pays for a cost: our margin on top, then converted at
 * the month's rate (in millionths). Both amounts are in minor units.
 */
export function customerPrice(costMicros: bigint, toCurrency: string, marginBps: number, rateMicros: bigint): bigint {
  const withMargin = costMicros + applyBps(costMicros, marginBps);
  return microsToMinor(divRound(withMargin * rateMicros, 1_000_000n), toCurrency);
}

export function microsToMinor(micros: bigint, currency: string): bigint {
  return divRound(micros * 10n ** BigInt(currencyInfo(currency).exponent), 1_000_000n);
}

const monthOf = (d: Date) => toDateOnly(d).slice(0, 7);

async function rateFor(db: Pick<PrismaClient, "fxRate">, month: string, base: string, quote: string): Promise<bigint | null> {
  if (base === quote) return 1_000_000n;
  const upTo = await db.fxRate.findFirst({ where: { base, quote, month: { lte: month } }, orderBy: { month: "desc" } });
  return upTo?.rateMicros ?? null;
}

export interface ImportDeps {
  db: PrismaClient;
  staff: StaffActor;
}

export interface ImportResult {
  importId: string;
  rowsRead: number;
  rowsImported: number;
  customers: number;
  notes: string[];
}

/** Imports a usage file: matched rows replace those days' usage, and each customer's savings checks run again. */
export async function importUsage(deps: ImportDeps, fileName: string, text: string): Promise<ImportResult> {
  assertStaffCan(deps.staff, "manageCloudSpend");
  const { rows, rowsRead, skipped } = readUsageFile(text);
  const notes: string[] = [];
  if (skipped) notes.push(`${skipped} ${skipped === 1 ? "row was" : "rows were"} skipped: no subscription, date, cost or currency we could read.`);

  const ids = [...new Set(rows.map((r) => r.subscription))];
  const subs = await deps.db.cloudSubscription.findMany({ where: { subscriptionId: { in: ids } }, include: { organisation: { select: { id: true, name: true, currency: true } } } });
  const byId = new Map(subs.map((s) => [s.subscriptionId, s]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) notes.push(`Not linked to any customer, so not imported: ${unknown.join(", ")}.`);

  // Price every matched row; a month with no exchange rate is left out, with a note.
  const priced: { row: UsageRow; sub: (typeof subs)[number]; priceMinor: bigint }[] = [];
  const noRate = new Set<string>();
  const rates = new Map<string, bigint | null>();
  for (const row of rows) {
    const sub = byId.get(row.subscription);
    if (!sub) continue;
    const to = sub.organisation.currency;
    const rk = `${monthOf(row.day)}|${row.currency}|${to}`;
    if (!rates.has(rk)) rates.set(rk, await rateFor(deps.db, monthOf(row.day), row.currency, to));
    const rate = rates.get(rk);
    if (!rate) {
      noRate.add(`${row.currency} to ${to} for ${monthOf(row.day)}`);
      continue;
    }
    priced.push({ row, sub, priceMinor: customerPrice(row.micros, to, sub.marginBps, rate) });
  }
  for (const r of noRate) notes.push(`No exchange rate ${r}. Enter it under Pricing and upload the file again.`);

  const days = priced.map((p) => p.row.day.getTime());
  const firstDay = days.length ? new Date(Math.min(...days)) : null;
  const lastDay = days.length ? new Date(Math.max(...days)) : null;

  const result = await deps.db.$transaction(
    async (tx) => {
      const imp = await tx.cloudUsageImport.create({ data: { fileName: fileName.slice(0, 200), rowsRead, rowsImported: priced.length, firstDay, lastDay, notes, importedById: deps.staff.userId } });
      const bySub = new Map<string, typeof priced>();
      for (const p of priced) bySub.set(p.sub.id, [...(bySub.get(p.sub.id) ?? []), p]);
      for (const [subId, list] of bySub) {
        const sub = list[0].sub;
        const daysInFile = [...new Set(list.map((p) => toDateOnly(p.row.day)))].map((d) => parseDateOnly(d)!);
        await tx.cloudUsage.deleteMany({ where: { subscriptionId: subId, day: { in: daysInFile } } });
        await tx.cloudUsage.createMany({
          data: list.map(({ row, priceMinor }) => ({
            organisationId: sub.organisationId,
            subscriptionId: subId,
            day: row.day,
            resourceGroup: row.resourceGroup,
            resource: row.resource,
            resourceType: row.resourceType,
            category: row.category,
            costMinor: microsToMinor(row.micros, row.currency),
            costCurrency: row.currency,
            priceMinor,
            currency: sub.organisation.currency,
            importId: imp.id,
          })),
        });
        await audit(tx, staffAudit(deps.staff, sub.organisationId, { action: "cloud.usage_imported", summary: `Imported Azure usage for ${sub.name}, ${daysInFile.length} ${daysInFile.length === 1 ? "day" : "days"}`, targetType: "CloudSubscription", targetId: subId }));
      }
      const orgs = [...new Set(priced.map((p) => p.sub.organisationId))];
      for (const org of orgs) await findIdleResources(tx, org);
      return { importId: imp.id, customers: orgs.length };
    },
    { timeout: 60_000 },
  );
  return { ...result, rowsRead, rowsImported: priced.length, notes };
}

// ─── Linking subscriptions ───────────────────────────────────────────

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function linkSubscription(deps: ImportDeps, organisationId: string, input: { subscriptionId: string; name: string; margin: string }) {
  assertStaffCan(deps.staff, "manageCloudSpend");
  const subscriptionId = input.subscriptionId.trim().toLowerCase();
  const name = input.name.trim();
  const margin = Number(input.margin.trim().replace(/%$/, ""));
  const errors: Record<string, string> = {};
  if (!GUID.test(subscriptionId)) errors.subscriptionId = "Paste the subscription id as Azure shows it, like 3f2b8c1e-0a4d-4b7e-9c61-2d5e8f7a1b90.";
  if (!name || name.length > 80) errors.name = "Give the subscription a name the customer will recognise.";
  if (!Number.isFinite(margin) || margin < 0 || margin > 100) errors.margin = "Enter our margin as a percentage, from 0 to 100.";
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
  return deps.db.$transaction(async (tx) => {
    const taken = await tx.cloudSubscription.findUnique({ where: { subscriptionId } });
    if (taken && taken.organisationId !== organisationId) throw new DomainError("conflict", "That subscription is linked to another customer.", "subscriptionId");
    const marginBps = Math.round(margin * 100);
    const saved = taken
      ? await tx.cloudSubscription.update({ where: { id: taken.id }, data: { name, marginBps } })
      : await tx.cloudSubscription.create({ data: { organisationId, subscriptionId, name, marginBps } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: taken ? "cloud.subscription_updated" : "cloud.subscription_linked", summary: `${taken ? "Updated" : "Linked"} Azure subscription ${name} at ${margin}% margin`, targetType: "CloudSubscription", targetId: saved.id }));
    return saved;
  });
}

// ─── Idle resources ──────────────────────────────────────────────────

/** How many days with no server time before a resource group counts as switched off. */
export const IDLE_DAYS = 7;
const LOOKBACK_DAYS = 60;
const COMPUTE = "virtual machines";

export const idleKey = (subscriptionId: string, group: string) => `azure-idle:${subscriptionId}:${group}`;

/**
 * Resource groups whose servers look switched off: no server time in the
 * last week of usage, some before that, and disks or addresses still
 * costing money. Each becomes a saving worth what those cost a month.
 * A group whose servers are running again loses its open tip.
 */
export async function findIdleResources(tx: Prisma.TransactionClient, organisationId: string) {
  const subs = await tx.cloudSubscription.findMany({ where: { organisationId }, include: { organisation: { select: { currency: true } } } });
  for (const sub of subs) {
    const latest = await tx.cloudUsage.findFirst({ where: { subscriptionId: sub.id }, orderBy: { day: "desc" }, select: { day: true } });
    if (!latest) continue;
    const recentFrom = addDays(latest.day, -(IDLE_DAYS - 1));
    const usage = await tx.cloudUsage.findMany({ where: { subscriptionId: sub.id, day: { gte: addDays(latest.day, -LOOKBACK_DAYS) } }, select: { day: true, resourceGroup: true, category: true, priceMinor: true } });
    const groups = new Map<string, { recentCompute: bigint; earlierCompute: bigint; recentOther: bigint }>();
    for (const u of usage) {
      const g = groups.get(u.resourceGroup) ?? { recentCompute: 0n, earlierCompute: 0n, recentOther: 0n };
      const compute = u.category.toLowerCase() === COMPUTE;
      if (u.day >= recentFrom) {
        if (compute) g.recentCompute += u.priceMinor;
        else g.recentOther += u.priceMinor;
      } else if (compute) g.earlierCompute += u.priceMinor;
      groups.set(u.resourceGroup, g);
    }
    for (const [group, g] of groups) {
      const key = idleKey(sub.subscriptionId, group);
      const idle = g.recentCompute === 0n && g.earlierCompute > 0n && g.recentOther > 0n;
      if (!idle) {
        await tx.savingTip.deleteMany({ where: { organisationId, key, source: "AUTO", status: "OPEN" } });
        continue;
      }
      const monthly = divRound(g.recentOther * 30n, BigInt(IDLE_DAYS));
      const where = { organisationId_key: { organisationId, key } };
      const text = {
        title: `Servers in ${group || "one resource group"} look switched off`,
        detail: `No server time was used there in the last ${IDLE_DAYS} days of ${sub.name}, but its disks and addresses still cost money. If you no longer need them, we can remove them for you, keeping a backup copy first if you like.`,
        monthlyMinor: monthly,
        currency: sub.organisation.currency,
      };
      await tx.savingTip.upsert({ where, create: { organisationId, key, source: "AUTO", ...text }, update: text });
    }
  }
}
