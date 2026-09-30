import { addDays, daysBetween, formatDay } from "@/lib/dates";
import { divRound, formatMoney, money, times, total, type Money } from "@/lib/domain/money";
import type { Domain, Invoice, InvoiceSummary, Service, Transaction } from "./adapter";

/**
 * What the Home, Services and Billing pages work out from billing data.
 * Pure functions over the adapter's types, so they are tested without a
 * database and behave the same on the stub and on WHMCS.
 */

const BILLED: Service["status"][] = ["active", "suspended"];

/** A service's price per month; annual prices are spread over twelve months. */
export function monthlyPrice(s: Pick<Service, "recurring" | "billingCycle">): Money {
  return s.billingCycle === "annually" ? money(divRound(s.recurring.amountMinor, 12n), s.recurring.currency) : s.recurring;
}

/** What the organisation pays each month for everything it has running. */
export function monthlyTotal(services: Service[], currency: string): Money {
  return total(services.filter((s) => BILLED.includes(s.status)).map(monthlyPrice), currency);
}

/** The next date anything falls due, and what falls due then. */
export function nextInvoice(services: Service[], domains: Domain[], currency: string): { dueOn: Date; amount: Money } | null {
  const due: { on: Date; amount: Money }[] = [
    ...services.filter((s) => BILLED.includes(s.status)).map((s) => ({ on: s.nextDueOn, amount: s.recurring })),
    ...domains.filter((d) => d.status === "active" && d.autoRenew).map((d) => ({ on: d.nextDueOn, amount: money(d.renewal.amountMinor * BigInt(d.registrationYears), d.renewal.currency) })),
  ];
  if (!due.length) return null;
  const first = Math.min(...due.map((d) => d.on.getTime()));
  return { dueOn: new Date(first), amount: total(due.filter((d) => d.on.getTime() === first).map((d) => d.amount), currency) };
}

/** What is still owed across unpaid invoices. */
export function amountOwed(invoices: InvoiceSummary[], currency: string): Money {
  return total(invoices.filter((i) => i.status === "unpaid" || i.status === "payment_pending" || i.status === "collections").map((i) => i.total), currency);
}

export const isOverdue = (i: InvoiceSummary, today: Date) => i.status === "unpaid" && i.dueOn < today;

export interface AttentionItem {
  key: string;
  tone: "negative" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

/** Licences bought but held by no one, from the Users and licences view. */
export interface UnusedLicenceFact {
  name: string;
  unused: number;
}

/**
 * What unused licences cost a month: the matching service's monthly price
 * for one seat, times the number unused. Null when no service of that name
 * is billed, so the page says nothing rather than guess.
 */
export function unusedCost(services: Service[], l: UnusedLicenceFact): Money | null {
  const s = services.find((x) => BILLED.includes(x.status) && x.name === l.name && x.quantity > 0);
  if (!s) return null;
  const month = monthlyPrice(s);
  return times(money(divRound(month.amountMinor, BigInt(s.quantity)), month.currency), l.unused);
}

/** Things someone should look at, most urgent first. */
export function attentionItems(invoices: InvoiceSummary[], services: Service[], domains: Domain[], today: Date, locale: string, unused: UnusedLicenceFact[] = []): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const l of unused) {
    const cost = unusedCost(services, l);
    items.push({
      key: `lic-${l.name}`,
      tone: "warning",
      title: `${l.unused} unused ${l.name} ${l.unused === 1 ? "licence" : "licences"}`,
      detail: cost ? `About ${formatMoney(cost, locale)} a month for licences no one holds.` : "Paid for but held by no one.",
      href: "/app/licences",
      actionLabel: "Review licences",
    });
  }
  for (const i of invoices) {
    if (i.status !== "unpaid") continue;
    const href = `/app/billing/invoices/${i.invoiceId}`;
    if (i.dueOn < today) {
      const days = daysBetween(i.dueOn, today);
      items.push({ key: `inv-${i.invoiceId}`, tone: "negative", title: `Invoice ${i.number} is overdue`, detail: `${formatMoney(i.total, locale)} was due ${days === 1 ? "yesterday" : `${days} days ago`}.`, href, actionLabel: "View invoice" });
    } else if (i.dueOn <= addDays(today, 7)) {
      items.push({ key: `inv-${i.invoiceId}`, tone: "warning", title: `Invoice ${i.number} is due ${i.dueOn.getTime() === today.getTime() ? "today" : `on ${formatDay(i.dueOn)}`}`, detail: `${formatMoney(i.total, locale)} to pay.`, href, actionLabel: "View invoice" });
    }
  }
  for (const s of services) {
    const href = `/app/services/${s.serviceId}`;
    if (s.status === "suspended") {
      items.push({ key: `svc-${s.serviceId}`, tone: "negative", title: `${s.name} is paused`, detail: s.suspendReason ? `Reason: ${s.suspendReason}.` : "Contact support to find out why.", href, actionLabel: "View service" });
    } else if (s.status === "pending") {
      items.push({ key: `svc-${s.serviceId}`, tone: "info", title: `${s.name} is being set up`, detail: "We'll let you know when it's ready.", href, actionLabel: "View service" });
    }
  }
  for (const d of domains) {
    const href = "/app/services#domains";
    if (d.status === "expired") {
      items.push({ key: `dom-${d.domainId}`, tone: "negative", title: `${d.name} has expired`, detail: "Renew it soon, or someone else can register it.", href, actionLabel: "View domains" });
    } else if (d.status === "active" && d.expiresOn <= addDays(today, 30)) {
      const days = daysBetween(today, d.expiresOn);
      items.push({
        key: `dom-${d.domainId}`,
        tone: d.autoRenew ? "info" : "warning",
        title: `${d.name} expires ${days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
        detail: d.autoRenew ? "It renews on its own and will be on your next invoice." : "It won't renew on its own.",
        href,
        actionLabel: "View domains",
      });
    }
  }
  const rank = { negative: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ─── Invoice changes from last month ─────────────────────────────────

export type LineChange =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up" | "down"; previous: Money; previousDescription: string };

export interface InvoiceComparison {
  /** The invoice compared against, or null for the first one. */
  previous: InvoiceSummary | null;
  /** By line id, for lines that bill a service. */
  lines: Map<string, LineChange>;
  /** Services on the previous invoice that aren't on this one. */
  removed: { description: string; amount: Money }[];
  /** This total less the previous total. */
  difference: Money | null;
}

/** Invoices issued before this one, newest first, to search for the previous monthly invoice. */
export function invoicesBefore(all: InvoiceSummary[], current: InvoiceSummary): InvoiceSummary[] {
  return all
    .filter((i) => i.invoiceId !== current.invoiceId && i.status !== "cancelled" && i.status !== "draft")
    .filter((i) => i.issuedOn < current.issuedOn || (i.issuedOn.getTime() === current.issuedOn.getTime() && Number(i.invoiceId) < Number(current.invoiceId)))
    .sort((a, b) => b.issuedOn.getTime() - a.issuedOn.getTime() || Number(b.invoiceId) - Number(a.invoiceId));
}

/**
 * Whether an invoice is a recurring monthly invoice: it bills at least one
 * service for a period, and nothing but services and domain renewals. An
 * order's first invoice also bills services, so invoices raised by an order
 * (their ids in `orderInvoiceIds`) never count; nor do invoices with set-up,
 * part-period, upgrade or one-off lines.
 */
export function isMonthly(i: Invoice, orderInvoiceIds: ReadonlySet<string>): boolean {
  if (orderInvoiceIds.has(i.invoiceId)) return false;
  return i.lines.some((l) => l.kind === "service") && i.lines.every((l) => l.kind === "service" || l.kind === "domain");
}

/**
 * Compares a monthly invoice with the monthly invoice before it, looking
 * back a few invoices at most. Returns null for any other invoice, so
 * one-off, order and part-period invoices show no comparison at all.
 */
export async function compareWithPreviousMonthly(current: Invoice, all: InvoiceSummary[], load: (invoiceId: string) => Promise<Invoice | null>, orderInvoiceIds: ReadonlySet<string>): Promise<InvoiceComparison | null> {
  if (!isMonthly(current, orderInvoiceIds)) return null;
  for (const candidate of invoicesBefore(all, current).slice(0, 6)) {
    if (orderInvoiceIds.has(candidate.invoiceId)) continue;
    const full = await load(candidate.invoiceId);
    if (full && isMonthly(full, orderInvoiceIds)) return compareInvoices(current, full);
  }
  return compareInvoices(current, null);
}

export function compareInvoices(current: Invoice, previous: Invoice | null): InvoiceComparison {
  const lines = new Map<string, LineChange>();
  if (!previous) return { previous: null, lines, removed: [], difference: null };
  const before = new Map<string, { amount: Money; description: string }>();
  for (const l of previous.lines) {
    if (l.kind === "service" && l.relatedId) before.set(l.relatedId, { amount: l.amount, description: l.description });
  }
  const seen = new Set<string>();
  for (const l of current.lines) {
    if (l.kind !== "service" || !l.relatedId) continue;
    seen.add(l.relatedId);
    const was = before.get(l.relatedId);
    if (!was) lines.set(l.lineId, { kind: "new" });
    else if (was.amount.amountMinor === l.amount.amountMinor) lines.set(l.lineId, { kind: "same" });
    else lines.set(l.lineId, { kind: was.amount.amountMinor < l.amount.amountMinor ? "up" : "down", previous: was.amount, previousDescription: was.description });
  }
  const removed = [...before.entries()].filter(([id]) => !seen.has(id)).map(([, v]) => v);
  return {
    previous,
    lines,
    removed,
    difference: previous.total.currency === current.total.currency ? money(current.total.amountMinor - previous.total.amountMinor, current.total.currency) : null,
  };
}

// ─── Statements ──────────────────────────────────────────────────────

export interface StatementRow {
  date: Date;
  kind: "invoice" | "payment";
  reference: string;
  description: string;
  invoiceId?: string;
  charge?: Money;
  payment?: Money;
  /** What was owed after this row. */
  balance: Money;
}

export interface Statement {
  from: Date;
  to: Date;
  opening: Money;
  rows: StatementRow[];
  charges: Money;
  payments: Money;
  closing: Money;
}

/**
 * An account statement: invoices raised and payments received between two
 * dates, with the running balance. Cancelled and draft invoices are left
 * out; refunds count as negative payments.
 */
export function buildStatement(invoices: InvoiceSummary[], transactions: Transaction[], from: Date, to: Date, currency: string): Statement {
  const counted = invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft" && i.total.currency === currency);
  const txns = transactions.filter((t) => t.amountIn.currency === currency);
  const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const before = (d: Date) => dayOf(d) < from.getTime();
  const within = (d: Date) => dayOf(d) >= from.getTime() && dayOf(d) <= to.getTime();
  const net = (t: Transaction) => t.amountIn.amountMinor - t.amountOut.amountMinor;

  let balance = 0n;
  for (const i of counted) if (before(i.issuedOn)) balance += i.total.amountMinor;
  for (const t of txns) if (before(t.date)) balance -= net(t);
  const opening = money(balance, currency);

  type Pending = Omit<StatementRow, "balance"> & { order: number };
  const pending: Pending[] = [
    ...counted.filter((i) => within(i.issuedOn)).map((i) => ({ date: i.issuedOn, kind: "invoice" as const, reference: i.number, description: `Invoice ${i.number}`, invoiceId: i.invoiceId, charge: i.total, order: 0 })),
    ...txns.filter((t) => within(t.date)).map((t) => ({ date: t.date, kind: "payment" as const, reference: t.reference, description: net(t) < 0n ? "Refund" : "Payment, thank you", invoiceId: t.invoiceId, payment: money(net(t), currency), order: 1 })),
  ].sort((a, b) => dayOf(a.date) - dayOf(b.date) || a.order - b.order);

  let charges = 0n;
  let payments = 0n;
  const rows: StatementRow[] = pending.map(({ order: _order, ...row }) => {
    if (row.charge) {
      balance += row.charge.amountMinor;
      charges += row.charge.amountMinor;
    }
    if (row.payment) {
      balance -= row.payment.amountMinor;
      payments += row.payment.amountMinor;
    }
    return { ...row, balance: money(balance, currency) };
  });
  return { from, to, opening, rows, charges: money(charges, currency), payments: money(payments, currency), closing: money(balance, currency) };
}
