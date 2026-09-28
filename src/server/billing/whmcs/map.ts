import { currencyInfo, money, parseMoney, type Money } from "@/lib/domain/money";
import { parseDateOnly } from "@/lib/dates";
import type {
  BillingClient,
  BillingCycle,
  BillingProduct,
  Domain,
  DomainStatus,
  Invoice,
  InvoiceLineKind,
  InvoiceStatus,
  InvoiceSummary,
  NewBillingClient,
  NewOrder,
  PayMethod,
  Service,
  ServiceStatus,
  TldPrice,
  Transaction,
} from "../adapter";

/**
 * The only place WHMCS field names appear. Each function turns one WHMCS
 * API response (as documented at developers.whmcs.com, see
 * docs/whmcs-api-notes.md) into our domain model, or our input into the
 * request parameters. They are pure, so they are tested without WHMCS.
 *
 * WHMCS quirks handled here: numbers arrive as strings, lists are nested
 * ({"invoices":{"invoice":[...]}}), an empty list can be "" and dates can
 * be "0000-00-00".
 */

type Json = Record<string, unknown>;
export type Params = Record<string, string>;

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** "12.50" in a currency to Money. Negative amounts are kept. */
export function amount(value: unknown, currency: string): Money {
  const s = str(value).trim() || "0";
  return money(parseMoney(s, currency), currency);
}

/** "2026-09-27" or "2026-09-27 10:15:00"; "0000-00-00" and empty mean none. */
export function date(value: unknown): Date | undefined {
  const s = str(value).slice(0, 10);
  if (!s || s.startsWith("0000")) return undefined;
  return parseDateOnly(s) ?? undefined;
}

function requiredDate(value: unknown, what: string): Date {
  const d = date(value);
  if (!d) throw new Error(`WHMCS returned no ${what}.`);
  return d;
}

/** Unwraps {"invoices":{"invoice":[...]}}, tolerating "" and a single object. */
export function list(container: unknown, key: string): Json[] {
  if (!container || typeof container !== "object") return [];
  const inner = (container as Json)[key];
  if (Array.isArray(inner)) return inner as Json[];
  if (inner && typeof inner === "object") return [inner as Json];
  return [];
}

/** Money to the "12.50" WHMCS expects. Exact, since minor units are integers. */
export function toAmount(m: Money): string {
  const { exponent } = currencyInfo(m.currency);
  const negative = m.amountMinor < 0n;
  const abs = negative ? -m.amountMinor : m.amountMinor;
  const scale = 10n ** BigInt(exponent);
  const frac = exponent ? `.${(abs % scale).toString().padStart(exponent, "0")}` : "";
  return `${negative ? "-" : ""}${abs / scale}${frac}`;
}

// ─── Clients ──────────────────────────────────────────────────────────

export const CLIENT_STATUS: Record<string, BillingClient["status"]> = { Active: "active", Inactive: "inactive", Closed: "closed" };

/** GetClientsDetails.client, plus the currency code from GetCurrencies (the client only has a currency id). */
export function fromClient(c: Json, currencyCode: string): BillingClient {
  return {
    clientId: str(c.client_id ?? c.id),
    companyName: str(c.companyname),
    firstName: str(c.firstname),
    lastName: str(c.lastname),
    email: str(c.email),
    country: str(c.countrycode),
    currency: currencyCode,
    address1: str(c.address1) || undefined,
    city: str(c.city) || undefined,
    phone: str(c.phonenumber) || undefined,
    taxId: str(c.tax_id) || undefined,
    status: CLIENT_STATUS[str(c.status)] ?? "active",
  };
}

/** AddClient. WHMCS requires state and postcode; Botswana has neither, so they get placeholders. */
export function toAddClient(input: NewBillingClient, currencyId: string): Params {
  return {
    firstname: input.firstName,
    lastname: input.lastName,
    companyname: input.companyName,
    email: input.email,
    address1: input.address1 || "Not given",
    city: input.city || "Not given",
    state: "Not given",
    postcode: "0000",
    country: input.country,
    phonenumber: input.phone || "0",
    ...(input.taxId ? { tax_id: input.taxId } : {}),
    currency: currencyId,
    // The console sends its own emails; WHMCS stays quiet.
    noemail: "true",
    skipvalidation: "true",
  };
}

// ─── Catalogue ────────────────────────────────────────────────────────

/** GetProducts.products.product[]. "-1.00" marks a cycle that is switched off. */
export function fromProduct(p: Json): BillingProduct {
  const prices: BillingProduct["prices"] = {};
  const pricing = (p.pricing ?? {}) as Record<string, Json>;
  for (const [currency, cycles] of Object.entries(pricing)) {
    const cycle = (v: unknown) => (str(v) === "" || str(v) === "-1.00" || Number(str(v)) < 0 ? undefined : amount(v, currency));
    prices[currency] = { monthly: cycle(cycles.monthly), annually: cycle(cycles.annually), setup: cycle(cycles.msetupfee) };
  }
  return {
    productId: str(p.pid),
    groupId: str(p.gid),
    groupName: str(p.groupname ?? p.gid),
    name: str(p.name),
    type: str(p.type),
    prices,
    hidden: str(p.hidden) === "1" || p.hidden === true,
  };
}

// ─── Orders ───────────────────────────────────────────────────────────

const CYCLE: Record<BillingCycle, string> = { monthly: "monthly", annually: "annually" };

/** AddOrder. Arrays are sent as name[0], name[1] and so on. */
export function toAddOrder(clientId: string, order: NewOrder): Params {
  const params: Params = {
    clientid: clientId,
    paymentmethod: order.paymentMethod,
    noemail: "true",
    noinvoiceemail: "true",
    ...(order.createInvoice ? {} : { noinvoice: "true" }),
  };
  order.items.forEach((item, i) => {
    params[`pid[${i}]`] = item.productId;
    params[`qty[${i}]`] = String(item.quantity);
    params[`billingcycle[${i}]`] = CYCLE[item.billingCycle];
    params[`priceoverride[${i}]`] = toAmount(item.recurringPrice);
    if (item.domain) params[`domain[${i}]`] = item.domain;
    if (item.options && Object.keys(item.options).length) {
      // Keyed by config option id in real use; the console sends ids as the keys.
      params[`configoptions[${i}]`] = Buffer.from(phpSerialize(item.options)).toString("base64");
    }
  });
  return params;
}

/** AddOrder's response: serviceids and domainids are comma-separated strings. */
export function fromAddOrder(r: Json) {
  const ids = (v: unknown) => str(v).split(",").map((s) => s.trim()).filter(Boolean);
  const invoiceId = str(r.invoiceid);
  return { orderId: str(r.orderid), invoiceId: invoiceId && invoiceId !== "0" ? invoiceId : undefined, serviceIds: ids(r.serviceids), domainIds: ids(r.domainids) };
}

/**
 * PHP's serialize() for a flat string map, which is what AddOrder's
 * configoptions and customfields expect (base64 encoded). Lengths are in
 * bytes, as PHP counts them.
 */
export function phpSerialize(map: Record<string, string>): string {
  const s = (v: string) => `s:${Buffer.byteLength(v, "utf8")}:"${v}";`;
  const key = (k: string) => (/^(0|[1-9]\d*)$/.test(k) ? `i:${k};` : s(k));
  const entries = Object.entries(map);
  return `a:${entries.length}:{${entries.map(([k, v]) => key(k) + s(v)).join("")}}`;
}

// ─── Services ─────────────────────────────────────────────────────────

export const SERVICE_STATUS: Record<string, ServiceStatus> = {
  Pending: "pending",
  Active: "active",
  Suspended: "suspended",
  Terminated: "terminated",
  Cancelled: "cancelled",
  Fraud: "cancelled",
  Completed: "terminated",
};

/**
 * GetClientsProducts.products.product[]. The response also carries the
 * service's password, which is dropped here and must never be logged.
 */
export function fromService(p: Json, currency: string): Service {
  const usage: NonNullable<Service["details"]["usage"]> = [];
  const disk = Number(str(p.diskusage));
  const diskLimit = Number(str(p.disklimit));
  if (diskLimit > 0) usage.push({ label: "Disk", used: disk, limit: diskLimit, unit: "MB" });
  const bw = Number(str(p.bwusage));
  const bwLimit = Number(str(p.bwlimit));
  if (bwLimit > 0) usage.push({ label: "Bandwidth", used: bw, limit: bwLimit, unit: "MB" });
  const resources = list(p.configoptions, "configoption").map((o) => ({ label: str(o.option), value: str(o.value) }));
  return {
    serviceId: str(p.id),
    productId: str(p.pid),
    orderId: str(p.orderid) || undefined,
    name: str(p.name),
    groupName: str(p.groupname),
    domain: str(p.domain) || undefined,
    status: SERVICE_STATUS[str(p.status)] ?? "pending",
    quantity: Number(str(p.qty)) || 1,
    recurring: amount(p.recurringamount, currency),
    billingCycle: str(p.billingcycle).toLowerCase() === "annually" ? "annually" : "monthly",
    registeredOn: requiredDate(p.regdate, "registration date"),
    nextDueOn: date(p.nextduedate) ?? requiredDate(p.regdate, "registration date"),
    suspendReason: str(p.suspensionreason) || undefined,
    details: { ...(resources.length ? { resources } : {}), ...(usage.length ? { usage } : {}) },
  };
}

// ─── Invoices and payments ────────────────────────────────────────────

export const INVOICE_STATUS: Record<string, InvoiceStatus> = {
  Draft: "draft",
  Unpaid: "unpaid",
  Paid: "paid",
  Cancelled: "cancelled",
  Refunded: "refunded",
  Collections: "collections",
  "Payment Pending": "payment_pending",
};

export const LINE_KIND: Record<string, InvoiceLineKind> = {
  Hosting: "service",
  Domain: "domain",
  DomainRegister: "domain",
  DomainTransfer: "domain",
  Setup: "setup",
  ProRata: "prorata",
  Upgrade: "upgrade",
};

/** GetInvoices.invoices.invoice[]. */
export function fromInvoiceSummary(i: Json): InvoiceSummary {
  const currency = str(i.currencycode);
  return {
    invoiceId: str(i.id ?? i.invoiceid),
    number: str(i.invoicenum) || str(i.id ?? i.invoiceid),
    issuedOn: requiredDate(i.date, "invoice date"),
    dueOn: requiredDate(i.duedate, "due date"),
    paidOn: date(i.datepaid),
    status: INVOICE_STATUS[str(i.status)] ?? "unpaid",
    total: amount(i.total, currency),
  };
}

/** GetInvoice. It has no currency field, so the client's currency is passed in. */
export function fromInvoice(i: Json, currency: string): Invoice {
  const taxRate = str(i.taxrate) || "0";
  return {
    ...fromInvoiceSummary({ ...i, currencycode: currency }),
    subtotal: amount(i.subtotal, currency),
    tax: add(amount(i.tax, currency), amount(i.tax2, currency)),
    taxRateBps: Math.round(Number(taxRate) * 100),
    balance: amount(i.balance, currency),
    lines: list(i.items, "item").map((l) => ({
      lineId: str(l.id),
      kind: LINE_KIND[str(l.type)] ?? "item",
      relatedId: str(l.relid) && str(l.relid) !== "0" ? str(l.relid) : undefined,
      description: str(l.description),
      amount: amount(l.amount, currency),
      taxed: str(l.taxed) === "1" || l.taxed === true,
    })),
    payments: list(i.transactions, "transaction").map((t) => fromTransaction(t, currency)),
    notes: str(i.notes) || undefined,
  };
}

function add(a: Money, b: Money): Money {
  return money(a.amountMinor + b.amountMinor, a.currency);
}

/** GetTransactions.transactions.transaction[] (and GetInvoice.transactions). */
export function fromTransaction(t: Json, currency: string): Transaction {
  return {
    transactionId: str(t.id),
    date: requiredDate(t.date, "transaction date"),
    invoiceId: str(t.invoiceid) && str(t.invoiceid) !== "0" ? str(t.invoiceid) : undefined,
    gateway: str(t.gateway),
    reference: str(t.transid),
    amountIn: amount(t.amountin, currency),
    amountOut: amount(t.amountout, currency),
    description: str(t.description),
  };
}

/** AddInvoicePayment. The date format is "YYYY-MM-DD HH:mm:ss". */
export function toAddInvoicePayment(invoiceId: string, payment: { amount: Money; gateway: string; reference: string; paidAt: Date }): Params {
  const d = payment.paidAt.toISOString();
  return {
    invoiceid: invoiceId,
    transid: payment.reference,
    gateway: payment.gateway,
    date: `${d.slice(0, 10)} ${d.slice(11, 19)}`,
    amount: toAmount(payment.amount),
    noemail: "true",
  };
}

/** GetPayMethods.paymethods[] (a plain array). */
export function fromPayMethod(p: Json, defaultId?: string): PayMethod {
  const bank = str(p.type) === "BankAccount";
  return {
    payMethodId: str(p.id),
    kind: bank ? "bank_account" : "card",
    description: str(p.description) || (bank ? "Bank account" : `${str(p.card_type)} ending ${str(p.card_last_four)}`),
    cardBrand: str(p.card_type) || undefined,
    lastFour: str(p.card_last_four) || undefined,
    expiry: str(p.expiry_date) || undefined,
    isDefault: defaultId !== undefined && str(p.id) === defaultId,
  };
}

// ─── Domains ──────────────────────────────────────────────────────────

export const DOMAIN_STATUS: Record<string, DomainStatus> = {
  Pending: "pending",
  "Pending Registration": "pending",
  "Pending Transfer": "pending_transfer",
  Active: "active",
  Expired: "expired",
  Grace: "expired",
  Redemption: "expired",
  Cancelled: "cancelled",
  Fraud: "cancelled",
  "Transferred Away": "transferred_away",
};

/** GetClientsDomains.domains.domain[]. */
export function fromDomain(d: Json, currency: string): Domain {
  return {
    domainId: str(d.id),
    name: str(d.domainname),
    registrar: str(d.registrar),
    status: DOMAIN_STATUS[str(d.status)] ?? "pending",
    registeredOn: requiredDate(d.regdate, "registration date"),
    expiresOn: date(d.expirydate) ?? requiredDate(d.regdate, "registration date"),
    nextDueOn: date(d.nextduedate) ?? requiredDate(d.regdate, "registration date"),
    renewal: amount(d.recurringamount, currency),
    registrationYears: Number(str(d.regperiod)) || 1,
    autoRenew: !(str(d.donotrenew) === "1" || d.donotrenew === true),
  };
}

/** GetTLDPricing: pricing keyed by TLD without the dot, one-year prices under "1". */
export function fromTldPricing(r: Json): TldPrice[] {
  const currency = str((r.currency as Json | undefined)?.code);
  const pricing = (r.pricing ?? {}) as Record<string, Json>;
  return Object.entries(pricing)
    .map(([tld, p]) => ({
      tld: `.${tld.replace(/^\./, "")}`,
      register: amount((p.register as Json | undefined)?.["1"], currency),
      renew: amount((p.renew as Json | undefined)?.["1"], currency),
      transfer: amount((p.transfer as Json | undefined)?.["1"], currency),
    }))
    .sort((a, b) => a.tld.localeCompare(b.tld));
}
