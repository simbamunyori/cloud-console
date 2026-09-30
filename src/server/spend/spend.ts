import type { Prisma } from "@prisma/client";
import { addMonths, endOfMonth, startOfMonth, toDateOnly } from "@/lib/dates";
import { divRound, money, type Money } from "@/lib/domain/money";
import type { Invoice, InvoiceStatus, InvoiceSummary, Service } from "@/server/billing/adapter";
import { monthlyTotal, unusedCost } from "@/server/billing/views";
import type { TenantDb } from "@/server/db";
import type { UnusedLicence } from "@/server/licences/licences";
import { USAGE_LINE_PREFIX } from "./billing";

/**
 * Cloud spend: what the customer spends with us each month and on what,
 * a forecast for this month, and ways to spend less. Invoices say what was
 * charged; Azure usage says what is being used before it is invoiced.
 */

/** Invoices that count as spend. Drafts, cancelled and refunded ones don't. */
const COUNTED: InvoiceStatus[] = ["paid", "unpaid", "payment_pending", "collections"];
export const AZURE_USAGE = "Azure usage";
const DOMAINS = "Domains";
const OTHER = "Other";
const HISTORY_MONTHS = 12;
const MIN_MONTHS = 6;

export interface SpendLine {
  category: string;
  label: string;
  amountMinor: bigint;
}

/** An invoice's lines, grouped by the service group each is for. */
export function invoiceLines(invoice: Invoice, services: Pick<Service, "serviceId" | "groupName" | "name">[]): SpendLine[] {
  const byId = new Map(services.map((s) => [s.serviceId, s]));
  const out = new Map<string, SpendLine>();
  for (const line of invoice.lines) {
    // Azure usage is counted in the month it was used, from the usage itself.
    if (line.description.startsWith(USAGE_LINE_PREFIX)) continue;
    const service = line.relatedId && line.kind !== "domain" ? byId.get(line.relatedId) : undefined;
    const category = line.kind === "domain" ? DOMAINS : (service?.groupName ?? OTHER);
    const label = line.kind === "domain" ? "Domain names" : (service?.name ?? line.description.split("\n")[0].slice(0, 80));
    const key = `${category}|${label}`;
    const had = out.get(key);
    if (had) had.amountMinor += line.amount.amountMinor;
    else out.set(key, { category, label, amountMinor: line.amount.amountMinor });
  }
  return [...out.values()];
}

interface BillingReader {
  listInvoices(): Promise<InvoiceSummary[]>;
  getInvoice(invoiceId: string): Promise<Invoice | null>;
  listServices(): Promise<Service[]>;
}

/**
 * Brings the kept copy of the last year's invoices up to date. Only
 * invoices that are new, or whose status or total changed, are read in
 * full, so a visit usually costs one call to billing.
 */
export async function syncInvoiceSpend(db: TenantDb, billing: BillingReader, organisationId: string, today: Date, known?: { invoices?: InvoiceSummary[]; services?: Service[] }) {
  const since = addMonths(startOfMonth(today), -HISTORY_MONTHS);
  const invoices = (known?.invoices ?? (await billing.listInvoices())).filter((i) => i.issuedOn >= since);
  const kept = new Map((await db.invoiceSpend.findMany({ where: { month: { gte: since } }, select: { invoiceId: true, status: true, totalMinor: true } })).map((r) => [r.invoiceId, r]));
  const stale = invoices.filter((i) => {
    const k = kept.get(i.invoiceId);
    return !k || k.status !== i.status || k.totalMinor !== i.total.amountMinor;
  });
  if (!stale.length) return;
  const services = known?.services ?? (await billing.listServices());
  for (const summary of stale) {
    const invoice = COUNTED.includes(summary.status) ? await billing.getInvoice(summary.invoiceId) : null;
    const lines = invoice ? invoiceLines(invoice, services).map((l) => ({ ...l, amountMinor: String(l.amountMinor) })) : [];
    const data = { month: startOfMonth(summary.issuedOn), status: summary.status, totalMinor: summary.total.amountMinor, currency: summary.total.currency, lines: lines as Prisma.InputJsonValue, readAt: new Date() };
    await db.invoiceSpend.upsert({ where: { organisationId_invoiceId: { organisationId, invoiceId: summary.invoiceId } }, create: { organisationId, invoiceId: summary.invoiceId, ...data }, update: data });
  }
}

export interface MonthSpend {
  /** First day of the month. */
  month: Date;
  total: bigint;
  byCategory: { category: string; amountMinor: bigint }[];
}

export interface UsageRow {
  day: Date;
  subscriptionId: string;
  resourceGroup: string;
  category: string;
  priceMinor: bigint;
  currency: string;
}

/** Up to the last twelve months, oldest first, including this one so far. Months before the first spend are left off, keeping at least six. */
export function monthlySpend(kept: { month: Date; status: string; currency: string; lines: unknown }[], usage: UsageRow[], currency: string, today: Date): MonthSpend[] {
  const first = addMonths(startOfMonth(today), -(HISTORY_MONTHS - 1));
  const months = Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(first, i));
  const cells = new Map<string, Map<string, bigint>>();
  const add = (month: Date, category: string, amount: bigint) => {
    const k = toDateOnly(month);
    const m = cells.get(k) ?? new Map<string, bigint>();
    m.set(category, (m.get(category) ?? 0n) + amount);
    cells.set(k, m);
  };
  for (const r of kept) {
    if (r.currency !== currency || !COUNTED.includes(r.status as InvoiceStatus)) continue;
    for (const l of r.lines as { category: string; amountMinor: string }[]) add(r.month, l.category, BigInt(l.amountMinor));
  }
  for (const u of usage) if (u.currency === currency) add(startOfMonth(u.day), AZURE_USAGE, u.priceMinor);
  const firstSpend = months.findIndex((m) => cells.has(toDateOnly(m)));
  const from = firstSpend < 0 ? HISTORY_MONTHS - MIN_MONTHS : Math.min(firstSpend, HISTORY_MONTHS - MIN_MONTHS);
  return months.slice(from).map((month) => {
    const m = cells.get(toDateOnly(month)) ?? new Map<string, bigint>();
    const byCategory = [...m.entries()].map(([category, amountMinor]) => ({ category, amountMinor })).sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : b.amountMinor < a.amountMinor ? -1 : a.category.localeCompare(b.category)));
    return { month, total: byCategory.reduce((n, c) => n + c.amountMinor, 0n), byCategory };
  });
}

export interface Forecast {
  total: Money;
  /** What running services cost a month. */
  fixed: Money;
  /** Azure usage for the whole month at the pace so far. */
  usage: Money | null;
  /** "pace": this month's usage so far, stretched to the whole month; "last-month": no usage yet this month, so last month's. */
  usageBasis: "pace" | "last-month" | null;
}

/**
 * This month's forecast: running services plus Azure usage at this
 * month's pace. When invoices issued this month already come to more
 * than the services' monthly price (a setup charge, a part month), those
 * count instead, so the forecast is never below what's been invoiced.
 */
export function forecast(services: Service[], usage: UsageRow[], currency: string, today: Date, invoicedThisMonth = 0n): Forecast {
  const running = monthlyTotal(services, currency);
  const fixed = invoicedThisMonth > running.amountMinor ? money(invoicedThisMonth, currency) : running;
  const month = startOfMonth(today);
  const mine = usage.filter((u) => u.currency === currency);
  const thisMonth = mine.filter((u) => u.day >= month);
  let projected: bigint | null = null;
  let usageBasis: Forecast["usageBasis"] = null;
  if (thisMonth.length) {
    const lastDay = Math.max(...thisMonth.map((u) => u.day.getUTCDate()));
    const days = endOfMonth(month).getUTCDate();
    projected = divRound(thisMonth.reduce((n, u) => n + u.priceMinor, 0n) * BigInt(days), BigInt(lastDay));
    usageBasis = "pace";
  } else {
    const last = mine.filter((u) => u.day >= addMonths(month, -1) && u.day < month);
    if (last.length) {
      projected = last.reduce((n, u) => n + u.priceMinor, 0n);
      usageBasis = "last-month";
    }
  }
  const usageMoney = projected === null ? null : money(projected, currency);
  return { total: money(fixed.amountMinor + (projected ?? 0n), currency), fixed, usage: usageMoney, usageBasis };
}

export interface SavingView {
  key: string;
  /** A tip row's id, or null for unused licences, which are worked out each time. */
  tipId: string | null;
  source: "LICENCES" | "AUTO" | "STAFF";
  title: string;
  detail: string;
  monthly: Money | null;
  status: "OPEN" | "ASKED" | "DONE" | "DISMISSED";
  href?: string;
}

/** Ways to save: unused licences first, then tips we found or staff added, largest first. */
export function savings(unused: UnusedLicence[], services: Service[], tips: { id: string; key: string; source: "AUTO" | "STAFF"; title: string; detail: string; monthlyMinor: bigint; currency: string; status: SavingView["status"] }[]): SavingView[] {
  const licences: SavingView[] = unused.map((l) => ({
    key: `lic-${l.name}`,
    tipId: null,
    source: "LICENCES",
    title: `${l.unused} unused ${l.name} ${l.unused === 1 ? "licence" : "licences"}`,
    detail: "Paid for but held by no one. Give them to someone, or lower the number of seats.",
    monthly: unusedCost(services, l),
    status: "OPEN",
    href: "/app/licences",
  }));
  const found: SavingView[] = tips
    .filter((t) => t.status !== "DONE" && t.status !== "DISMISSED")
    .sort((a, b) => (b.monthlyMinor > a.monthlyMinor ? 1 : b.monthlyMinor < a.monthlyMinor ? -1 : 0))
    .map((t) => ({ key: t.key, tipId: t.id, source: t.source, title: t.title, detail: t.detail, monthly: money(t.monthlyMinor, t.currency), status: t.status }));
  return [...licences, ...found];
}

/** What the open savings add up to a month, in the organisation's currency. */
export function savingsTotal(list: SavingView[], currency: string): Money {
  return money(
    list.filter((s) => s.status === "OPEN" && s.monthly?.currency === currency).reduce((n, s) => n + s.monthly!.amountMinor, 0n),
    currency,
  );
}

/** One month's spend by category, with the change from the month before. */
export function breakdown(months: MonthSpend[], index: number): { category: string; amountMinor: bigint; previousMinor: bigint }[] {
  const now = months[index];
  const before = index > 0 ? months[index - 1] : null;
  const prev = new Map(before?.byCategory.map((c) => [c.category, c.amountMinor]) ?? []);
  const rows = now.byCategory.map((c) => ({ category: c.category, amountMinor: c.amountMinor, previousMinor: prev.get(c.category) ?? 0n }));
  for (const [category, previousMinor] of prev) if (!now.byCategory.some((c) => c.category === category)) rows.push({ category, amountMinor: 0n, previousMinor });
  return rows;
}

/** What invoices issued this month come to, before VAT. */
export function invoicedThisMonth(kept: { month: Date; status: string; currency: string; lines: unknown }[], currency: string, today: Date): bigint {
  const month = startOfMonth(today).getTime();
  let n = 0n;
  for (const r of kept) {
    if (r.month.getTime() !== month || r.currency !== currency || !COUNTED.includes(r.status as InvoiceStatus)) continue;
    for (const l of r.lines as { amountMinor: string }[]) n += BigInt(l.amountMinor);
  }
  return n;
}
