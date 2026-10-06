import type { LeadSource, PrismaClient } from "@prisma/client";
import { CYCLE_MONTHS, type BillingAdapter, type Service } from "@/server/billing/adapter";
import { divRound, formatMoney, money } from "@/lib/domain/money";
import { queueEmail } from "@/server/email/outbox";
import { featureOn } from "@/server/features/features";
import { hasBought } from "@/server/leads/capture";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { measureMonth, monthRange } from "@/server/units/units";

/**
 * The success dashboard (docs/STRATEGY_ROLLOUT.md, U8): managed customers
 * and net new, monthly recurring revenue by pillar against hosting-only
 * revenue, leads by source and conversion, response times and
 * satisfaction, and the average security score. Taken every night for the
 * month so far; on the 1st, last month is taken once more and emailed to
 * the directors. Admins set a target for each figure.
 */

export const PILLARS = {
  cloud: "Cloud and productivity",
  security: "Security and SOC",
  resilience: "Resilience and compliance",
  growth: "Digital growth (hosting, domains, websites)",
  apps: "Business apps",
  other: "Other",
} as const;
export type Pillar = keyof typeof PILLARS;
export const PILLAR_KEYS = Object.keys(PILLARS) as Pillar[];

/** Anything beyond hosting makes a customer managed. */
const MANAGED: Pillar[] = ["cloud", "security", "resilience", "apps"];

/** Which pillar a catalogue product counts under: by its category, with backup and security told apart. */
export function pillarOf(product: { slug: string; categoryKey: string } | null): Pillar {
  if (!product) return "other";
  const { slug, categoryKey: c } = product;
  if (["productivity", "public-cloud", "servers", "plans", "services"].includes(c)) return "cloud";
  if (c === "protection") return /security|detection|soc|firewall/.test(slug) ? "security" : "resilience";
  if (c === "web") return "growth";
  if (c === "our-software" || c === "expense-management") return "apps";
  if (c === "legacy-services") return /hosting|domain|web/.test(slug) ? "growth" : "cloud";
  return "other";
}

export interface SuccessData {
  month: string;
  currency: string;
  customers: number;
  managedCustomers: number;
  hostingOnlyCustomers: number;
  /** Organisation ids, so next month can tell who joined and who left. */
  managedIds: string[];
  /** Null without last month's figures. */
  netNew: number | null;
  gained: number | null;
  lost: number | null;
  /** Minor units of the reporting currency, as strings. */
  mrrByPillar: Record<Pillar, string>;
  mrrTotal: string;
  managedMrr: string;
  hostingOnlyMrr: string;
  managedShare: number | null;
  leadsBySource: { source: LeadSource; leads: number; converted: number }[];
  leads: number;
  converted: number;
  conversion: number | null;
  tickets: number;
  firstWithin: number | null;
  satisfaction: number | null;
  ratings: number;
  securityScore: number | null;
  scored: number;
  /** Customers whose services couldn't be read, and amounts with no exchange rate. */
  unreadable: number;
  unconverted: number;
}

export type FigureKey = "managedCustomers" | "netNew" | "managedMrr" | "managedShare" | "leads" | "conversion" | "firstWithin" | "satisfaction" | "securityScore";

export const FIGURES: { key: FigureKey; label: string; unit: "count" | "money" | "percent" | "score5" | "score100" }[] = [
  { key: "managedCustomers", label: "Managed customers", unit: "count" },
  { key: "netNew", label: "Net new managed customers", unit: "count" },
  { key: "managedMrr", label: "Monthly recurring revenue from managed customers", unit: "money" },
  { key: "managedShare", label: "Share of revenue from managed customers", unit: "percent" },
  { key: "leads", label: "Leads", unit: "count" },
  { key: "conversion", label: "Leads that became customers", unit: "percent" },
  { key: "firstWithin", label: "First replies within target", unit: "percent" },
  { key: "satisfaction", label: "Customer satisfaction", unit: "score5" },
  { key: "securityScore", label: "Average security score", unit: "score100" },
];

/** A figure as a plain number to compare with its target (money in whole currency units). */
export function figureValue(d: SuccessData, key: FigureKey): number | null {
  if (key === "managedMrr") return Number(divRound(BigInt(d.managedMrr), 100n));
  return d[key];
}

export type FigureStatus = "on-track" | "behind" | "no-target" | "no-data";

/** Every figure is better higher, so on track means at or above its target. */
export function figureStatus(value: number | null, target: number | undefined): FigureStatus {
  if (target === undefined) return "no-target";
  if (value === null) return "no-data";
  return value >= target ? "on-track" : "behind";
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);

async function rateMicros(db: Pick<PrismaClient, "fxRate">, day: string, base: string, quote: string): Promise<bigint | null> {
  if (base === quote) return 1_000_000n;
  const r = await db.fxRate.findFirst({ where: { base, quote, month: { lte: day } }, orderBy: { month: "desc" } });
  return r?.rateMicros ?? null;
}

/** Takes (or retakes) a month's figures. Services are as they stand now; leads and tickets are the month's. */
export async function takeSnapshot(db: PrismaClient, adapter: BillingAdapter, opts: { month?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const month = opts.month ?? now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  const currency = (await db.market.findUnique({ where: { code: "bw" }, select: { currency: true } }))?.currency ?? "BWP";

  const [orgs, products] = await Promise.all([
    db.organisation.findMany({ where: { deletedAt: null, internal: false, billingAccount: { provider: adapter.provider } }, select: { id: true, billingAccount: { select: { externalClientId: true } } } }),
    db.product.findMany({ select: { slug: true, name: true, categoryKey: true, billingProductId: true } }),
  ]);
  const byBillingId = new Map(products.filter((p) => p.billingProductId).map((p) => [p.billingProductId!, p]));
  const byName = new Map(products.map((p) => [p.name, p]));
  const rates = new Map<string, bigint | null>();

  const mrr = Object.fromEntries(PILLAR_KEYS.map((p) => [p, 0n])) as Record<Pillar, bigint>;
  let managedMrr = 0n;
  let hostingOnlyMrr = 0n;
  let customers = 0;
  let hostingOnly = 0;
  let unreadable = 0;
  let unconverted = 0;
  const managedIds: string[] = [];

  for (const org of orgs) {
    let services: Service[];
    try {
      services = (await adapter.listServices(org.billingAccount!.externalClientId)).filter((s) => s.status === "active");
    } catch {
      unreadable++;
      continue;
    }
    if (!services.length) continue;
    customers++;
    const pillars = new Set<Pillar>();
    let orgMrr = 0n;
    for (const s of services) {
      const pillar = pillarOf(byBillingId.get(s.productId) ?? byName.get(s.name) ?? null);
      pillars.add(pillar);
      const key = s.recurring.currency;
      if (!rates.has(key)) rates.set(key, await rateMicros(db, day, key, currency));
      const rate = rates.get(key)!;
      if (rate === null) {
        unconverted++;
        continue;
      }
      const monthly = divRound(divRound(s.recurring.amountMinor, BigInt(CYCLE_MONTHS[s.billingCycle] ?? 1)) * rate, 1_000_000n);
      mrr[pillar] += monthly;
      orgMrr += monthly;
    }
    if (MANAGED.some((p) => pillars.has(p))) {
      managedIds.push(org.id);
      managedMrr += orgMrr;
    } else if ([...pillars].every((p) => p === "growth")) {
      hostingOnly++;
      hostingOnlyMrr += orgMrr;
    }
  }
  const mrrTotal = PILLAR_KEYS.reduce((n, p) => n + mrr[p], 0n);

  const before = await db.successSnapshot.findUnique({ where: { month: monthBefore(month) } });
  const earlier = before ? new Set((before.data as unknown as SuccessData).managedIds) : null;
  const gained = earlier ? managedIds.filter((id) => !earlier.has(id)).length : null;
  const lost = earlier ? [...earlier].filter((id) => !managedIds.includes(id)).length : null;

  const { from, to } = monthRange(month);
  const leadRows = await db.lead.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { source: true, email: true } });
  const bought = new Map<string, boolean>();
  for (const l of leadRows) if (!bought.has(l.email)) bought.set(l.email, await hasBought(db, l.email));
  const sources = [...new Set(leadRows.map((l) => l.source))].sort();
  const leadsBySource = sources.map((source) => {
    const rows = leadRows.filter((l) => l.source === source);
    return { source, leads: rows.length, converted: rows.filter((l) => bought.get(l.email)).length };
  });
  const converted = leadRows.filter((l) => bought.get(l.email)).length;

  const response = await measureMonth(db, month);
  const tickets = response.measures.reduce((n, m) => n + m.tickets, 0);
  const firstRows = response.measures.filter((m) => m.firstWithin !== null);
  const firstN = firstRows.reduce((n, m) => n + m.tickets, 0);
  const firstWithin = firstN ? Math.round(firstRows.reduce((s, m) => s + m.firstWithin! * m.tickets, 0) / firstN) : null;

  const score = await db.securityProfile.aggregate({ where: { score: { not: null }, organisation: { deletedAt: null, internal: false } }, _avg: { score: true }, _count: { score: true } });

  const data: SuccessData = {
    month,
    currency,
    customers,
    managedCustomers: managedIds.length,
    hostingOnlyCustomers: hostingOnly,
    managedIds,
    netNew: gained === null || lost === null ? null : gained - lost,
    gained,
    lost,
    mrrByPillar: Object.fromEntries(PILLAR_KEYS.map((p) => [p, mrr[p].toString()])) as Record<Pillar, string>,
    mrrTotal: mrrTotal.toString(),
    managedMrr: managedMrr.toString(),
    hostingOnlyMrr: hostingOnlyMrr.toString(),
    managedShare: mrrTotal ? Number(divRound(managedMrr * 100n, mrrTotal)) : null,
    leadsBySource,
    leads: leadRows.length,
    converted,
    conversion: pct(converted, leadRows.length),
    tickets,
    firstWithin,
    satisfaction: response.satisfaction,
    ratings: response.ratings,
    securityScore: score._avg.score === null ? null : Math.round(score._avg.score),
    scored: score._count.score,
    unreadable,
    unconverted,
  };
  await db.successSnapshot.upsert({ where: { month }, create: { month, data: data as object, takenAt: now }, update: { data: data as object, takenAt: now } });
  return data;
}

export const monthBefore = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

export async function successSettings(db: Pick<PrismaClient, "successSettings">) {
  const row = await db.successSettings.findUnique({ where: { id: "success" } });
  return { directorEmails: row?.directorEmails ?? [], targets: (row?.targets ?? {}) as Partial<Record<FigureKey, number>> };
}

/** Admins set the targets and who gets the monthly email. Blank leaves a figure without a target. */
export async function saveSuccessSettings(deps: { db: PrismaClient; staff: StaffActor }, input: { directorEmails: string; targets: Record<string, string> }) {
  assertStaffCan(deps.staff, "viewSuccess");
  const fieldErrors: Record<string, string> = {};
  const emails = [...new Set(input.directorEmails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) fieldErrors.directorEmails = "Enter email addresses, one per line.";
  if (emails.length > 10) fieldErrors.directorEmails = "Up to 10 addresses.";
  const targets: Partial<Record<FigureKey, number>> = {};
  for (const f of FIGURES) {
    const raw = (input.targets[f.key] ?? "").trim().replace(/,/g, "");
    if (!raw) continue;
    const n = Number(raw);
    const max = f.unit === "percent" || f.unit === "score100" ? 100 : f.unit === "score5" ? 5 : 1e12;
    const min = f.key === "netNew" ? -1e6 : 0;
    if (!Number.isFinite(n) || n < min || n > max || (f.unit !== "score5" && !Number.isInteger(n))) fieldErrors[f.key] = f.unit === "score5" ? "Enter 0 to 5, such as 4.5." : f.unit === "percent" || f.unit === "score100" ? "Enter a whole number from 0 to 100." : "Enter a whole number.";
    else targets[f.key] = n;
  }
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  await deps.db.$transaction(async (tx) => {
    await tx.successSettings.upsert({ where: { id: "success" }, create: { id: "success", directorEmails: emails, targets, updatedById: deps.staff.userId }, update: { directorEmails: emails, targets, updatedById: deps.staff.userId } });
    await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "success.settings", summary: `Changed the success targets and the monthly email (${emails.length} ${emails.length === 1 ? "director" : "directors"})`, data: { emails, targets } } });
  });
}

/** On the 1st: last month taken once more, then emailed to the directors, once, while the switch is on. */
export async function sendDirectorsReport(db: PrismaClient, adapter: BillingAdapter, now = new Date()) {
  const month = monthBefore(now.toISOString().slice(0, 7));
  if (!(await featureOn(db, "directors-report"))) return { month, sent: 0 };
  const { directorEmails } = await successSettings(db);
  if (!directorEmails.length) return { month, sent: 0 };
  const existing = await db.successSnapshot.findUnique({ where: { month } });
  if (existing?.reportedAt) return { month, sent: 0 };
  await takeSnapshot(db, adapter, { month, now });
  const claimed = await db.successSnapshot.updateMany({ where: { month, reportedAt: null }, data: { reportedAt: now } });
  if (!claimed.count) return { month, sent: 0 };
  for (const to of directorEmails) await queueEmail(db, { to, kind: "success.monthly", payload: { month } });
  return { month, sent: directorEmails.length };
}

/** A figure as people read it. */
export function formatFigure(d: SuccessData, key: FigureKey, locale = "en-BW"): string {
  const unit = FIGURES.find((f) => f.key === key)!.unit;
  if (key === "managedMrr") return formatMoney(money(BigInt(d.managedMrr), d.currency), locale);
  const v = d[key];
  if (v === null) return "Not enough data";
  if (unit === "percent") return `${v}%`;
  if (unit === "score5") return `${v} out of 5`;
  if (unit === "score100") return `${v} out of 100`;
  return key === "netNew" && v > 0 ? `+${v}` : String(v);
}

export const formatTarget = (key: FigureKey, target: number, currency: string, locale = "en-BW") => {
  const unit = FIGURES.find((f) => f.key === key)!.unit;
  if (unit === "money") return formatMoney(money(BigInt(Math.round(target)) * 100n, currency), locale);
  if (unit === "percent") return `${target}%`;
  if (unit === "score5") return `${target} out of 5`;
  if (unit === "score100") return `${target} out of 100`;
  return String(target);
};
