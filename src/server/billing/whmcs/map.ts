import { currencyInfo, money, parseMoney, type Money } from "@/lib/domain/money";
import { parseDateOnly } from "@/lib/dates";
import type {
  BillingClient,
  BillingClientPatch,
  BillingCycle,
  BillingOrder,
  DomainRequest,
  BillingProduct,
  Domain,
  DomainStatus,
  ImportedDomain,
  ImportedService,
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

/** Unwraps {"invoices":{"invoice":[...]}}, tolerating "", a single object and a plain array. */
export function list(container: unknown, key: string): Json[] {
  if (Array.isArray(container)) return container as Json[];
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

const CYCLE: Record<BillingCycle, string> = { monthly: "monthly", quarterly: "quarterly", semiannually: "semiannually", annually: "annually" };
/** How GetClientsProducts writes the cycle. */
const CYCLE_OF: Record<string, BillingCycle> = { monthly: "monthly", quarterly: "quarterly", "semi-annually": "semiannually", annually: "annually" };

/**
 * AddOrder. Arrays are sent as name[0], name[1] and so on. A product sold
 * per user has a "Users" quantity option (see quantityOptionId); its
 * quantity goes there and the service itself is one unit.
 */
export function toAddOrder(clientId: string, order: NewOrder, quantityOptions: Record<string, string> = {}): Params {
  const params: Params = {
    clientid: clientId,
    paymentmethod: order.paymentMethod,
    noemail: "true",
    noinvoiceemail: "true",
    ...(order.createInvoice ? {} : { noinvoice: "true" }),
  };
  order.items.forEach((item, i) => {
    const quantityOption = quantityOptions[item.productId];
    params[`pid[${i}]`] = item.productId;
    params[`qty[${i}]`] = quantityOption ? "1" : String(item.quantity);
    params[`billingcycle[${i}]`] = CYCLE[item.billingCycle];
    params[`priceoverride[${i}]`] = toAmount(item.recurringPrice);
    if (item.domain) params[`domain[${i}]`] = item.domain;
    // WHMCS wants configurable options by id. Choices the console keys by
    // their label (the operating system, say) have no WHMCS option; they
    // stay on the console's own order, where the set-up team reads them.
    const byId = Object.fromEntries(Object.entries(item.options ?? {}).filter(([k]) => /^\d+$/.test(k)));
    const options = { ...byId, ...(quantityOption ? { [quantityOption]: String(item.quantity) } : {}) };
    if (Object.keys(options).length) params[`configoptions[${i}]`] = Buffer.from(phpSerialize(options)).toString("base64");
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
  const resources = list(p.configoptions, "configoption")
    .filter((o) => !isQuantityOption(o))
    .map((o) => ({ label: str(o.option), value: str(o.value) }));
  return {
    serviceId: str(p.id),
    productId: str(p.pid),
    orderId: str(p.orderid) || undefined,
    name: str(p.name),
    groupName: str(p.groupname),
    domain: str(p.domain) || undefined,
    status: SERVICE_STATUS[str(p.status)] ?? "pending",
    quantity: serviceQuantity(p),
    recurring: amount(p.recurringamount, currency),
    billingCycle: CYCLE_OF[str(p.billingcycle).toLowerCase()] ?? "monthly",
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
    notes: str(i.notes).trim() || undefined,
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
export function fromTldPricing(r: Json, askedFor?: string): TldPrice[] {
  const currency = str((r.currency as Json | undefined)?.code).toUpperCase() || askedFor || "";
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

// ─── Currencies ───────────────────────────────────────────────────────

/** GetCurrencies.currencies.currency[]: WHMCS's own id for each code. */
export function fromCurrencies(r: Json): { id: string; code: string }[] {
  return list(r.currencies, "currency").map((c) => ({ id: str(c.id), code: str(c.code).toUpperCase() }));
}

// ─── Per-user quantity ────────────────────────────────────────────────

/** The configurable option that holds the number of users (type 4 is WHMCS's Quantity type). */
export const QUANTITY_OPTION_NAME = "Users";

function isQuantityOption(o: Json) {
  const type = str(o.type).toLowerCase();
  return type === "4" || type === "quantity" || str(o.option ?? o.name) === QUANTITY_OPTION_NAME;
}

export interface QuantityOption {
  optionId: string;
  /** The option's one choice; UpdateClientProduct needs it beside the quantity. */
  choiceId: string;
}

/** GetProducts.products.product[]: its "Users" quantity option, if it is sold per user. */
export function quantityOption(p: Json): QuantityOption | undefined {
  const option = list(p.configoptions, "configoption").find(isQuantityOption);
  if (!option) return undefined;
  const choice = list(option.options, "option")[0];
  return { optionId: str(option.id), choiceId: choice ? str(choice.id) : "0" };
}

/** A service's quantity: its "Users" option when it has one, otherwise WHMCS's own qty. */
function serviceQuantity(p: Json): number {
  const option = list(p.configoptions, "configoption").find(isQuantityOption);
  return Number(str(option ? option.value : p.qty)) || 1;
}

// ─── Upgrades ─────────────────────────────────────────────────────────

/** UpgradeProduct for a new number of users, or for another product. `calconly` only works out the charge. */
export function toUpgrade(serviceId: string, change: { quantityOptionId?: string; quantity?: number; productId?: string; billingCycle: BillingCycle }, paymentMethod: string, calcOnly: boolean): Params {
  const params: Params = { serviceid: serviceId, paymentmethod: paymentMethod, ...(calcOnly ? { calconly: "true" } : {}) };
  if (change.productId) {
    Object.assign(params, { type: "product", newproductid: change.productId, newproductbillingcycle: CYCLE[change.billingCycle] });
  } else {
    // UpgradeProduct takes configoptions as a plain array, not base64 as AddOrder does.
    Object.assign(params, { type: "configoptions", [`configoptions[${change.quantityOptionId}]`]: String(change.quantity) });
  }
  return params;
}

/** UpgradeProduct with calconly: the days left in the period, when WHMCS gives them. */
export function fromUpgradeDays(r: Json): { daysLeft?: number; daysInPeriod?: number } {
  const n = (v: unknown) => (str(v) === "" || !Number.isFinite(Number(str(v))) ? undefined : Number(str(v)));
  return { daysLeft: n(r.daysuntilrenewal), daysInPeriod: n(r.totaldays) };
}

/** UpgradeProduct's order and invoice ids (invoiceid is null when nothing is due). */
export function fromUpgradeOrder(r: Json) {
  const invoiceId = str(r.invoiceid);
  return { orderId: str(r.orderid), invoiceId: invoiceId && invoiceId !== "0" ? invoiceId : undefined };
}

/**
 * UpdateClientProduct: sets the "Users" quantity now. Unlike UpgradeProduct,
 * this takes configoptions base64 serialised, with a quantity as
 * {optionid, qty}.
 */
export function toServiceQuantity(serviceId: string, option: QuantityOption, quantity: number): Params {
  const serialized = `a:1:{i:${Number(option.optionId)};a:2:{s:8:"optionid";i:${Number(option.choiceId)};s:3:"qty";i:${quantity};}}`;
  return { serviceid: serviceId, configoptions: Buffer.from(serialized).toString("base64") };
}

/**
 * UpgradeProduct's amount is formatted ("P120.00 BWP", "$-8.67 USD"); this
 * reads the number out of it. A configoptions change answers with `total`
 * (checked on the live install), a product change with `price`.
 */
export function fromUpgradePrice(r: Json, currency: string): Money {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(str(r.total ?? r.price));
  return amount(m ? m[0].replace(/,/g, "") : "0", currency);
}

/** UpdateClientProduct: the recurring price for the whole service per cycle. */
/** UpdateClientProduct: move a service to another product. */
export function toServiceProduct(serviceId: string, productId: string, billingCycle: BillingCycle): Params {
  return { serviceid: serviceId, pid: productId, billingcycle: CYCLE[billingCycle] };
}

/** CreateInvoice with one line: a part-month charge, due today, not emailed (the console tells the customer). */
export function toPartMonthInvoice(clientId: string, line: { description: string; amount: Money; taxed: boolean; paymentMethod: string; today: Date }): Params {
  const today = dateOnly(line.today);
  return {
    userid: clientId,
    status: "Unpaid",
    sendinvoice: "0",
    paymentmethod: line.paymentMethod,
    date: today,
    duedate: today,
    itemdescription1: line.description,
    itemamount1: toAmount(line.amount),
    itemtaxed1: line.taxed ? "1" : "0",
    autoapplycredit: "0",
  };
}

/** UpdateInvoice: one-off lines added to an order's invoice. */
export function toNewInvoiceItems(invoiceId: string, lines: { description: string; amount: Money }[]): Params {
  const params: Params = { invoiceid: invoiceId };
  lines.forEach((l, i) => {
    params[`newitemdescription[${i}]`] = l.description;
    params[`newitemamount[${i}]`] = toAmount(l.amount);
    params[`newitemtaxed[${i}]`] = "1";
  });
  return params;
}

/** CreateInvoice for one-off lines when the order itself raised no invoice (nothing to pay monthly). */
export function toOneOffInvoice(clientId: string, lines: { description: string; amount: Money }[], paymentMethod: string, today: Date): Params {
  const date = dateOnly(today);
  const params: Params = { userid: clientId, status: "Unpaid", sendinvoice: "0", paymentmethod: paymentMethod, date, duedate: date, autoapplycredit: "0" };
  lines.forEach((l, i) => {
    params[`itemdescription${i + 1}`] = l.description;
    params[`itemamount${i + 1}`] = toAmount(l.amount);
    params[`itemtaxed${i + 1}`] = "1";
  });
  return params;
}

/** CreateInvoice for charges outside any order, due on the date given. */
export function toInvoice(clientId: string, invoice: { lines: { description: string; amount: Money; taxed: boolean }[]; paymentMethod: string; dueOn: Date; issuedOn?: Date }, today: Date): Params {
  const params: Params = { userid: clientId, status: "Unpaid", sendinvoice: "0", paymentmethod: invoice.paymentMethod, date: dateOnly(invoice.issuedOn ?? today), duedate: dateOnly(invoice.dueOn), autoapplycredit: "0" };
  invoice.lines.forEach((l, i) => {
    params[`itemdescription${i + 1}`] = l.description;
    params[`itemamount${i + 1}`] = toAmount(l.amount);
    params[`itemtaxed${i + 1}`] = l.taxed ? "1" : "0";
  });
  return params;
}

export const newInvoiceId = (r: Json) => str(r.invoiceid);

/** YYYY-MM-DD in UTC, as WHMCS takes dates. */
export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export function toRecurring(serviceId: string, recurring: Money): Params {
  return { serviceid: serviceId, recurringamount: toAmount(recurring) };
}

/** UpdateClientProduct: a status change made without a module (suspend reason kept). */
export function toServiceStatus(serviceId: string, status: ServiceStatus, reason?: string): Params {
  const name = Object.entries(SERVICE_STATUS).find(([, v]) => v === status)![0];
  return { serviceid: serviceId, status: name, ...(reason ? { suspendreason: reason } : {}) };
}

// ─── Orders list ──────────────────────────────────────────────────────

export const ORDER_STATUS: Record<string, BillingOrder["status"]> = { Pending: "pending", Active: "active", Cancelled: "cancelled", Fraud: "fraud" };

/** GetOrders.orders.order[]. The amount is in the client's currency. */
export function fromOrder(o: Json, currency: string): BillingOrder {
  const invoiceId = str(o.invoiceid);
  return {
    orderId: str(o.id),
    placedAt: new Date(`${str(o.date).replace(" ", "T")}Z`),
    status: ORDER_STATUS[str(o.status)] ?? "pending",
    invoiceId: invoiceId && invoiceId !== "0" ? invoiceId : undefined,
    total: amount(o.amount, currency),
  };
}

/** GetOrders.orders.order[].lineitems: the services and domains it created. */
export function orderItems(o: Json): { serviceIds: string[]; domainIds: string[] } {
  const items = list(o.lineitems, "lineitem");
  return {
    serviceIds: items.filter((l) => str(l.type).toLowerCase() === "product").map((l) => str(l.relid)),
    domainIds: items.filter((l) => str(l.type).toLowerCase() === "domain").map((l) => str(l.relid)),
  };
}

// ─── Invoices list ────────────────────────────────────────────────────

/** GetInvoices filters: userid, and WHMCS's own status name. */
export function toGetInvoices(clientId: string, status: InvoiceStatus | undefined, start: number, limit: number): Params {
  const name = status ? Object.entries(INVOICE_STATUS).find(([, v]) => v === status)?.[0] : undefined;
  return { userid: clientId, limitstart: String(start), limitnum: String(limit), orderby: "date", order: "desc", ...(name ? { status: name } : {}) };
}

/** UpdateInvoice: WHMCS's own status name. */
export function toInvoiceStatus(invoiceId: string, status: InvoiceStatus): Params {
  return { invoiceid: invoiceId, status: Object.entries(INVOICE_STATUS).find(([, v]) => v === status)![0] };
}

/** GetInvoice.userid: whose invoice it is. */
export const invoiceClientId = (i: Json) => str(i.userid);
/** GetClientsProducts.products.product[].clientid. */
export const serviceClientId = (p: Json) => str(p.clientid);
/** GetClientsDetails.client: WHMCS's currency id and, in newer versions, its code. */
export const clientCurrency = (c: Json) => ({ id: str(c.currency), code: str(c.currency_code).toUpperCase() || undefined });

// ─── Domains ordering ─────────────────────────────────────────────────

/** AddOrder for one domain registration or transfer, at our price. */
export function toDomainOrder(clientId: string, request: DomainRequest & { authCode?: string }, type: "register" | "transfer"): Params {
  return {
    clientid: clientId,
    paymentmethod: request.paymentMethod,
    noemail: "true",
    noinvoiceemail: "true",
    "domain[0]": request.name,
    "domaintype[0]": type,
    "regperiod[0]": String(request.years),
    "domainpriceoverride[0]": toAmount(request.price),
    ...(type === "transfer" && request.authCode ? { "eppcode[0]": request.authCode } : {}),
  };
}

/** AddOrder renewing one domain for `years`. */
export function toDomainRenewal(clientId: string, domainId: string, years: number, paymentMethod: string): Params {
  return { clientid: clientId, paymentmethod: paymentMethod, noemail: "true", noinvoiceemail: "true", [`domainrenewals[${domainId}]`]: String(years) };
}

/** DomainWhois: "available" or "unavailable". */
export const whoisAvailable = (r: Json) => str(r.status).toLowerCase() === "available";

/** GetClientsDetails.client.billingcid? WHMCS marks no default pay method in GetPayMethods, so the first one is. */
export const payMethods = (r: Json) => (Array.isArray(r.paymethods) ? (r.paymethods as Json[]) : list(r.paymethods, "paymethod"));

// ─── Request builders and response lists ─────────────────────────────

/** Parameters that name one thing, so the adapter never spells a WHMCS field. */
export const by = {
  client: (clientId: string): Params => ({ clientid: clientId }),
  clientDetails: (clientId: string): Params => ({ clientid: clientId, stats: "0" }),
  service: (serviceId: string): Params => ({ serviceid: serviceId }),
  clientService: (clientId: string, serviceId: string): Params => ({ clientid: clientId, serviceid: serviceId }),
  invoice: (invoiceId: string): Params => ({ invoiceid: invoiceId }),
  /** GetOrders filters by "id"; the other order actions take "orderid". */
  orderLookup: (orderId: string): Params => ({ id: orderId }),
  clientOrders: (clientId: string): Params => ({ userid: clientId }),
  product: (productId: string): Params => ({ pid: productId }),
  group: (groupId: string): Params => ({ gid: groupId }),
  domainName: (name: string): Params => ({ domain: name }),
  clientDomain: (clientId: string, domainId: string): Params => ({ clientid: clientId, domainid: domainId }),
  currency: (currencyId: string): Params => ({ currencyid: currencyId }),
  page: (start: number, limit: number): Params => ({ limitstart: String(start), limitnum: String(limit) }),
};

/** How many a paged list holds in all, when WHMCS says. */
export const totalResults = (r: Json) => (str(r.totalresults) === "" ? undefined : Number(str(r.totalresults)));

export const clientsProducts = (r: Json) => list(r.products, "product");
export const productsList = (r: Json) => list(r.products, "product");
export const ordersList = (r: Json) => list(r.orders, "order");
export const invoicesList = (r: Json) => list(r.invoices, "invoice");
export const domainsList = (r: Json) => list(r.domains, "domain");
export const transactionsList = (r: Json) => list(r.transactions, "transaction");
/** GetClientsDetails: the client, nested under "client" in current versions. */
export const clientRecord = (r: Json) => ((r.client && typeof r.client === "object" ? r.client : r) as Json);
/** GetTransactions rows carry the client as userid. */
export const transactionClientId = (t: Json) => str(t.userid);
/** GetClientsDomains rows: the client the domain belongs to. */
export const domainClientId = (d: Json) => str(d.userid ?? d.clientid);
export const newClientId = (r: Json) => str(r.clientid);
export const newPayMethodId = (r: Json) => str(r.paymethodid);

/** UpdateClient. Only the fields in the patch are sent. */
export function toUpdateClient(clientId: string, patch: BillingClientPatch, currencyId?: string): Params {
  const fields: [keyof BillingClientPatch, string][] = [
    ["companyName", "companyname"],
    ["firstName", "firstname"],
    ["lastName", "lastname"],
    ["email", "email"],
    ["country", "country"],
    ["address1", "address1"],
    ["city", "city"],
    ["phone", "phonenumber"],
    ["taxId", "tax_id"],
  ];
  const params: Params = { clientid: clientId, skipvalidation: "true" };
  for (const [ours, theirs] of fields) if (patch[ours] !== undefined) params[theirs] = String(patch[ours]);
  if (patch.status) params.status = Object.entries(CLIENT_STATUS).find(([, v]) => v === patch.status)![0];
  if (currencyId) params.currency = currencyId;
  return params;
}

/** AcceptOrder: set up at once and send no email. Domains go to the registrar only when asked. */
export function toAcceptOrder(orderId: string, sendToRegistrar: boolean): Params {
  return { orderid: orderId, autosetup: "true", sendemail: "0", sendregistrar: sendToRegistrar ? "true" : "0" };
}

/** AcceptOrder for a migrated service or domain: nothing is set up or sent to the registrar, and nobody is emailed. */
export function toAcceptImported(orderId: string): Params {
  return { orderid: orderId, autosetup: "0", sendemail: "0", sendregistrar: "0" };
}

/** UpdateClientProduct: a migrated service's own dates and price, active. */
export function toImportedService(serviceId: string, s: ImportedService): Params {
  return {
    serviceid: serviceId,
    status: "Active",
    regdate: dateOnly(s.registeredOn),
    nextduedate: dateOnly(s.nextDueOn),
    recurringamount: toAmount(s.recurringPrice),
    billingcycle: CYCLE[s.billingCycle],
    ...(s.domain ? { domain: s.domain } : {}),
    ...(s.note ? { notes: s.note } : {}),
  };
}

/** AddOrder for a domain we already manage: no invoice, at its renewal price. */
export function toImportedDomainOrder(clientId: string, d: ImportedDomain): Params {
  return {
    clientid: clientId,
    paymentmethod: "banktransfer",
    noemail: "true",
    noinvoice: "true",
    noinvoiceemail: "true",
    "domain[0]": d.name,
    "domaintype[0]": "register",
    "regperiod[0]": String(d.registrationYears),
    "domainpriceoverride[0]": toAmount(d.renewal),
    "domainrenewoverride[0]": toAmount(d.renewal),
  };
}

/**
 * UpdateClientDomain: the domain's own dates and renewal price, active. The
 * old registrar goes in the notes: WHMCS refuses a registrar that isn't an
 * active module there (the live install refused "cocca").
 */
export function toImportedDomain(domainId: string, d: ImportedDomain): Params {
  return {
    domainid: domainId,
    status: "Active",
    regperiod: String(d.registrationYears),
    regdate: dateOnly(d.registeredOn),
    expirydate: dateOnly(d.expiresOn),
    nextduedate: dateOnly(d.nextDueOn),
    recurringamount: toAmount(d.renewal),
    donotrenew: d.autoRenew ? "0" : "1",
    ...(d.registrar ? { notes: `Registered with ${d.registrar} before the move from Odoo.` } : {}),
  };
}

/**
 * CancelOrder, without cancelling any gateway subscription or emailing.
 * WHMCS reads flags the PHP way, so "false" counts as on: a flag we want
 * off is sent as "0" (the live install tried to cancel a subscription when
 * given cancelsub "false").
 */
export function toCancelOrder(orderId: string): Params {
  return { orderid: orderId, cancelsub: "0", noemail: "true" };
}

/** ModuleSuspend takes the reason; the other module actions only the service. */
export function toModuleAction(serviceId: string, reason?: string): Params {
  return { serviceid: serviceId, ...(reason ? { suspendreason: reason } : {}) };
}

/** UpdateInvoice: the whole notes text. An empty value would be ignored, so a blank line clears it. */
export function toInvoiceNotes(invoiceId: string, notes: string | null): Params {
  return { invoiceid: invoiceId, notes: notes ?? " " };
}

/** GetClientsDomains rows: just the name, id and status, for look-ups. */
export const fromDomainName = (d: Json) => str(d.domainname).toLowerCase();
export const fromDomainId = (d: Json) => str(d.id);
export const fromDomainStatus = (d: Json): DomainStatus => DOMAIN_STATUS[str(d.status)] ?? "pending";
/** GetOrders rows: the status and invoice, without amounts. */
export const orderStatus = (o: Json): BillingOrder["status"] => ORDER_STATUS[str(o.status)] ?? "pending";
export const orderInvoiceId = (o: Json) => (str(o.invoiceid) && str(o.invoiceid) !== "0" ? str(o.invoiceid) : undefined);
/** GetInvoice: the status alone. */
export const invoiceStatus = (i: Json): InvoiceStatus => INVOICE_STATUS[str(i.status)] ?? "unpaid";

/**
 * CreateOrUpdateTLD for one currency: register for 1 to 10 years, renew
 * for 1 to 9, and a one-year transfer at the registration price.
 */
export function toTldPricing(tld: string, register: Money, renew: Money): Params {
  const times = (m: Money, n: number) => toAmount(money(m.amountMinor * BigInt(n), m.currency));
  const params: Params = { extension: tld, currency_code: register.currency, "transfer[1]": toAmount(register) };
  for (let years = 1; years <= 10; years++) params[`register[${years}]`] = times(register, years);
  for (let years = 1; years <= 9; years++) params[`renew[${years}]`] = times(renew, years);
  return params;
}
