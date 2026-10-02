import { createHash } from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";
import { addDays, addMonths, formatDay, parseDateOnly, toDateOnly } from "@/lib/dates";
import { countryName, COUNTRY_CODES } from "@/lib/countries";
import { currencyInfo, divRound } from "@/lib/domain/money";
import { marketForCountry } from "@/lib/domain/markets";
import { type BillingCycle, CYCLE_MONTHS } from "@/server/billing/adapter";
import { DOMAIN_PATTERN } from "@/server/billing/stub/stub-adapter";
import { isLegacyCategory, legacySlug } from "@/server/catalogue/legacy";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { effectiveStatus } from "@/server/catalogue/visibility";
import type { OdooFile, OdooRow, OdooSource } from "./odoo";

/**
 * The dry run: what the import would write, worked out from the Odoo
 * exports, the product choices staff made, and what is already in the
 * console. Nothing is written here. Problems block approval; warnings
 * are for staff to read. Rows already imported by an earlier upload are
 * listed as done and skipped, so a second upload only adds what is new.
 */

export type HostedAt = "OURS" | "CONTABO" | "SITEGROUND" | "OTHER";

export interface Note {
  file: OdooFile;
  row?: number;
  message: string;
}

export interface PlannedPerson {
  ref: string;
  name: string;
  email: string;
  role: Role;
  /** Already has a console sign-in: added to the organisation, welcomed with a sign-in link. */
  existingUser: boolean;
}

export interface PlannedService {
  ref: string;
  row: number;
  subscription: string;
  odooProduct: string;
  /** The catalogue product, or a legacy one (made at import). */
  productSlug: string;
  productName: string;
  legacy: boolean;
  quantity: number;
  /** What billing holds: 1 for products not sold per user. */
  billingQuantity: number;
  cycle: BillingCycle;
  /** The whole service per period, in minor units of the customer's currency. */
  recurringMinor: string;
  registeredOn: string;
  nextDueOn: string;
  reviewOn: string | null;
  domain: string | null;
  hostedAt: HostedAt;
  hostServer: string | null;
  hostNotes: string | null;
  done: boolean;
}

export interface PlannedDomain {
  ref: string;
  row: number;
  name: string;
  registrar: string;
  registeredOn: string;
  expiresOn: string;
  renewalMinor: string;
  years: number;
  autoRenew: boolean;
  done: boolean;
}

export interface PlannedInvoice {
  ref: string;
  row: number;
  number: string;
  issuedOn: string;
  dueOn: string;
  amountMinor: string;
  description: string;
  done: boolean;
}

export interface PlannedCustomer {
  ref: string;
  row: number;
  name: string;
  country: string;
  market: string;
  currency: string;
  email: string | null;
  billingEmail: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  /** The organisation an earlier import made, which new rows are added to. */
  organisationId: string | null;
  people: PlannedPerson[];
  services: PlannedService[];
  domains: PlannedDomain[];
  invoices: PlannedInvoice[];
}

export interface ProductChoice {
  /** The Odoo product name, as exported. */
  odooProduct: string;
  lines: number;
  slug: string;
  name: string;
  legacy: boolean;
  /** "staff" when someone chose it, "name" when matched on the name, "none" for no close match. */
  how: "staff" | "name" | "none";
}

export interface PlanReport {
  customers: PlannedCustomer[];
  products: ProductChoice[];
  problems: Note[];
  warnings: Note[];
  /** Per currency, as minor-unit strings. */
  monthly: Record<string, string>;
  openingBalances: Record<string, string>;
  earliestDue: string | null;
  counts: { customers: number; people: number; services: number; domains: number; invoices: number; done: number; skipped: number };
}

/** Odoo product name to a product slug, or "legacy". */
export type ProductMapping = Record<string, string>;

type Db = Pick<PrismaClient, "market" | "product" | "migrationRecord" | "user" | "tld">;

// ─── Reading values ──────────────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** 2026-08-12 (with or without a time), 12/08/2026 (day first), 12.08.2026 or 12 Aug 2026. */
export function readDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/.exec(v);
  if (iso) return parseDateOnly(iso[1]);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (dmy) return parseDateOnly(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
  const words = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(v);
  if (words) {
    const m = MONTHS.indexOf(words[2].toLowerCase());
    if (m >= 0) return parseDateOnly(`${words[3]}-${String(m + 1).padStart(2, "0")}-${words[1].padStart(2, "0")}`);
  }
  return null;
}

const SCALE = 1_000_000n;

/** A decimal such as "1,234.5678", "P 120.00" or "-15", scaled by a million. Full stop for decimals. */
export function readDecimal(value: string): bigint | null {
  let s = value.trim().replace(/[\s  ,]/gu, "");
  s = s.replace(/^[^\d\-−.]+/u, "").replace(/[^\d.]+$/u, "");
  const negative = /^[-−]/.test(s);
  if (negative) s = s.slice(1);
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > 6) return null;
  const v = BigInt(whole || "0") * SCALE + BigInt((frac + "000000").slice(0, 6));
  return negative ? -v : v;
}

/** A scaled decimal in a currency's minor units, rounded half away from zero. */
const toMinor = (scaled: bigint, currency: string) => divRound(scaled * 10n ** BigInt(currencyInfo(currency).exponent), SCALE);

/** Monthly, Quarterly, 6 Months, Yearly, Annual... */
export function readCycle(plan: string): BillingCycle | null {
  const p = plan.trim().toLowerCase();
  const months = /(\d+)\s*months?/.exec(p);
  if (months) return ({ 1: "monthly", 3: "quarterly", 6: "semiannually", 12: "annually" } as Record<string, BillingCycle>)[months[1]] ?? null;
  if (/quarter/.test(p)) return "quarterly";
  if (/half|semi|bi-?annual|six/.test(p)) return "semiannually";
  if (/year|annual/.test(p)) return "annually";
  if (/month/.test(p)) return "monthly";
  return null;
}

/** "base.bw", "BW" or "Botswana". */
export function readCountry(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const xml = /^base\.([a-z]{2})$/i.exec(v);
  const code = (xml ? xml[1] : v).toUpperCase();
  if ((COUNTRY_CODES as readonly string[]).includes(code)) return code;
  return COUNTRY_CODES.find((c) => countryName(c).toLowerCase() === v.toLowerCase()) ?? null;
}

const ROLES: Record<string, Role> = { owner: "OWNER", admin: "ADMIN", administrator: "ADMIN", billing: "BILLING", finance: "BILLING", "read only": "READ_ONLY", "read-only": "READ_ONLY", readonly: "READ_ONLY" };

export function readHosting(value: string): { at: HostedAt; provider: string | null } {
  const v = value.trim();
  const l = v.toLowerCase();
  if (!l || /^(ours|us|our servers?|fourth generation.*)$/.test(l)) return { at: "OURS", provider: null };
  if (l.includes("contabo")) return { at: "CONTABO", provider: null };
  if (l.includes("siteground")) return { at: "SITEGROUND", provider: null };
  return { at: "OTHER", provider: v };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (s: string) => {
  const e = s.trim().toLowerCase();
  return EMAIL.test(e) ? e : null;
};
const orNull = (s: string) => s.trim() || null;
const stripCode = (s: string) => s.replace(/^\[[^\]]*\]\s*/, "").trim();
const CLOSED = /close|cancel|churn|done|expire|lost|6_|terminat/i;

// ─── Matching products ───────────────────────────────────────────────

const STOP = new Set(["the", "and", "for", "of", "a", "per", "plan", "monthly", "month", "annual", "yearly", "subscription", "service"]);
const tokens = (s: string) => new Set(stripCode(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !STOP.has(t)));

/** How alike two names are, 0 to 1 (Dice on words). */
export function nameScore(a: string, b: string) {
  if (stripCode(a).toLowerCase() === stripCode(b).toLowerCase()) return 1;
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return (2 * shared) / (x.size + y.size);
}

const MATCH_AT = 0.6;

// ─── The plan ────────────────────────────────────────────────────────

export async function planMigration(db: Db, source: OdooSource, mapping: ProductMapping, today: Date): Promise<PlanReport> {
  const problems: Note[] = source.problems.map((p) => ({ file: p.file, message: p.message }));
  const warnings: Note[] = [];
  const problem = (file: OdooFile, row: number | undefined, message: string) => problems.push({ file, row, message });
  const warn = (file: OdooFile, row: number | undefined, message: string) => warnings.push({ file, row, message });

  const [markets, products, records, tlds] = await Promise.all([
    db.market.findMany(),
    db.product.findMany({ include: { category: { include: { family: true } } } }),
    db.migrationRecord.findMany({ where: { targetId: { not: null } }, select: { kind: true, sourceRef: true, targetId: true, organisationId: true } }),
    db.tld.findMany({ select: { tld: true } }),
  ]);
  const doneRef = (kind: string, ref: string) => records.find((r) => r.kind === kind && r.sourceRef === ref);
  const candidates = products.filter((p) => p.slug !== DOMAIN_PRODUCT_SLUG && !isLegacyCategory(p.categoryKey) && effectiveStatus(p, p.category.family) !== "DRAFT");

  // Customers, by external id, and the people at each.
  const byRef = new Map<string, OdooRow<"customers">>();
  for (const c of source.customers) {
    if (!c.ref) problem("customers", c.row, "No ID. Export with \"I want to update data (import-compatible export)\" ticked, so each row has its ID.");
    else if (byRef.has(c.ref)) problem("customers", c.row, `ID ${c.ref} is on more than one row.`);
    else byRef.set(c.ref, c);
  }
  const contactParent = new Map<string, string>();
  const contactsOf = new Map<string, OdooRow<"contacts">[]>();
  const nameIndex = (rows: { ref: string; name: string }[]) => {
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.name.trim().toLowerCase(), [...(m.get(r.name.trim().toLowerCase()) ?? []), r.ref]);
    return m;
  };
  const customerNames = nameIndex(source.customers);

  /** A customer from an external id or a name, which may be one of their contact people. */
  function customerFor(file: OdooFile, row: number, ref: string, name: string): string | null {
    if (ref) {
      if (byRef.has(ref)) return ref;
      if (contactParent.has(ref)) return contactParent.get(ref)!;
      problem(file, row, `Customer ${ref} isn't in the customers file.`);
      return null;
    }
    // Odoo writes "Company, Person" for a contact person.
    const key = name.trim().toLowerCase();
    const options = customerNames.get(key) ?? customerNames.get(key.split(",")[0].trim()) ?? [];
    if (options.length === 1) return options[0];
    problem(file, row, options.length ? `More than one customer is called ${name}. Export the Customer/ID column instead of the name.` : `Customer ${name || "(blank)"} isn't in the customers file.`);
    return null;
  }

  for (const c of source.contacts) {
    const parent = c.parentRef ? (byRef.has(c.parentRef) ? c.parentRef : null) : (customerNames.get(c.parentName.trim().toLowerCase()) ?? []).length === 1 ? customerNames.get(c.parentName.trim().toLowerCase())![0] : null;
    if (!parent) {
      // People with no company are customers in their own right, or not customers at all.
      if (c.parentRef || c.parentName) warn("contacts", c.row, `${c.name} belongs to ${c.parentName || c.parentRef}, which isn't in the customers file, so they are left out.`);
      continue;
    }
    if (c.ref) contactParent.set(c.ref, parent);
    contactsOf.set(parent, [...(contactsOf.get(parent) ?? []), c]);
  }

  // Products: one choice per Odoo product name.
  const choices = new Map<string, ProductChoice>();
  function chooseProduct(odooProduct: string): ProductChoice {
    const existing = choices.get(odooProduct);
    if (existing) {
      existing.lines++;
      return existing;
    }
    const chosen = mapping[odooProduct];
    let choice: ProductChoice;
    const legacy = (how: ProductChoice["how"]): ProductChoice => ({ odooProduct, lines: 1, slug: legacySlug(odooProduct), name: stripCode(odooProduct) || odooProduct, legacy: true, how });
    if (chosen === "legacy") choice = legacy("staff");
    else if (chosen && candidates.some((p) => p.slug === chosen)) {
      const p = candidates.find((x) => x.slug === chosen)!;
      choice = { odooProduct, lines: 1, slug: p.slug, name: p.name, legacy: false, how: "staff" };
    } else {
      const best = candidates.map((p) => ({ p, score: nameScore(odooProduct, p.name) })).sort((a, b) => b.score - a.score)[0];
      choice = best && best.score >= MATCH_AT ? { odooProduct, lines: 1, slug: best.p.slug, name: best.p.name, legacy: false, how: "name" } : legacy("none");
    }
    choices.set(odooProduct, choice);
    return choice;
  }

  const planned = new Map<string, PlannedCustomer>();
  let skipped = 0;
  const customerPlan = (ref: string): PlannedCustomer | null => {
    if (planned.has(ref)) return planned.get(ref)!;
    const c = byRef.get(ref)!;
    const country = readCountry(c.country);
    if (!country) {
      problem("customers", c.row, c.country ? `Country "${c.country}" isn't one we know.` : `${c.name} has no country, which decides their prices and currency.`);
      return null;
    }
    const market = marketForCountry(country, markets);
    if (!market) {
      problem("customers", c.row, `We don't serve ${countryName(country)} yet, so ${c.name} has no market. Switch a market on for it first.`);
      return null;
    }
    const done = doneRef("customer", c.ref);
    const plan: PlannedCustomer = {
      ref: c.ref,
      row: c.row,
      name: c.name.trim(),
      country,
      market: market.code,
      currency: market.currency,
      email: cleanEmail(c.email),
      billingEmail: null,
      phone: orNull(c.phone) ?? orNull(c.mobile),
      addressLine1: orNull(c.street),
      addressLine2: orNull(c.street2),
      city: orNull(c.city),
      postcode: orNull(c.zip),
      vatNumber: orNull(c.vat),
      registrationNumber: orNull(c.registry),
      organisationId: done?.targetId ?? null,
      people: [],
      services: [],
      domains: [],
      invoices: [],
    };
    if (!plan.name) problem("customers", c.row, "No name.");
    planned.set(ref, plan);
    return plan;
  };

  // Services: one per subscription line that is still running.
  const lineNumbers = new Map<string, number>();
  for (const s of source.services) {
    const n = (lineNumbers.get(s.subscription) ?? 0) + 1;
    lineNumbers.set(s.subscription, n);
    if (!s.subscription) {
      problem("services", s.row, "No subscription reference.");
      continue;
    }
    if (s.status && CLOSED.test(s.status)) {
      skipped++;
      continue;
    }
    if (!s.product) {
      // A note or section line on the subscription.
      continue;
    }
    const customerRef = customerFor("services", s.row, s.customerRef, s.customerName);
    const customer = customerRef ? customerPlan(customerRef) : null;
    if (!customer) continue;
    const ref = `${s.subscription}#${n}`;
    const at = (message: string) => problem("services", s.row, `${s.subscription}, ${stripCode(s.product)}: ${message}`);
    if (s.currency && s.currency.trim().toUpperCase() !== customer.currency) {
      at(`it is in ${s.currency}, but ${customer.name} will be billed in ${customer.currency} (their market). Change their country or the subscription first.`);
      continue;
    }
    const cycle = readCycle(s.plan);
    if (!cycle) {
      at(`the billing period "${s.plan}" isn't one billing has. Use Monthly, Quarterly, 6 Months or Yearly.`);
      continue;
    }
    const quantity = readDecimal(s.quantity);
    if (quantity === null || quantity <= 0n || quantity % SCALE !== 0n) {
      at(`the quantity "${s.quantity}" isn't a whole number above zero.`);
      continue;
    }
    const unit = readDecimal(s.unitPrice);
    if (unit === null || unit < 0n) {
      at(`the unit price "${s.unitPrice}" isn't an amount.`);
      continue;
    }
    const discount = s.discount ? readDecimal(s.discount) : 0n;
    if (discount === null || discount < 0n || discount > 100n * SCALE) {
      at(`the discount "${s.discount}" isn't a percentage.`);
      continue;
    }
    const nextDue = readDate(s.nextInvoice);
    if (!nextDue) {
      at(`the next invoice date "${s.nextInvoice}" isn't a date.`);
      continue;
    }
    if (nextDue <= today) {
      at(`its next invoice date, ${formatDay(nextDue, true)}, isn't after today. Invoice it in Odoo first so it comes over as an unpaid invoice, then export again; otherwise it would be billed twice.`);
      continue;
    }
    const start = readDate(s.startDate);
    const registeredOn = start && start <= nextDue ? start : addMonths(nextDue, -CYCLE_MONTHS[cycle]);
    const reviewOn = s.reviewOn ? readDate(s.reviewOn) : null;
    if (s.reviewOn && !reviewOn) {
      at(`the price review date "${s.reviewOn}" isn't a date.`);
      continue;
    }
    const domain = s.domain.trim().toLowerCase() || null;
    if (domain && !DOMAIN_PATTERN.test(domain)) {
      at(`"${s.domain}" isn't a website address.`);
      continue;
    }
    const qty = Number(quantity / SCALE);
    // The line total, as Odoo works it out: quantity times unit price, less the discount.
    const recurring = divRound(unit * quantity * (100n * SCALE - discount) * 10n ** BigInt(currencyInfo(customer.currency).exponent), SCALE * SCALE * 100n * SCALE);
    const choice = chooseProduct(s.product);
    const product = choice.legacy ? null : candidates.find((p) => p.slug === choice.slug)!;
    const perUnit = product?.quantityAllowed ?? false;
    if (!perUnit && qty > 1) warn("services", s.row, `${s.subscription}: ${qty} x ${stripCode(s.product)} comes over as one ${choice.name} service at the line's total, because it isn't sold per user.`);
    if (choice.legacy && /domain/i.test(s.product)) warn("services", s.row, `${s.subscription}: ${stripCode(s.product)} looks like a domain name. Put domains in the domains file instead, so renewals follow the expiry date, and leave this line out.`);
    const hosting = readHosting(s.hostedAt);
    if (hosting.at !== "OURS" && !s.hostServer.trim()) warn("services", s.row, `${s.subscription}: hosted at ${hosting.provider ?? hosting.at.toLowerCase()} with no server or account, so staff tasks won't say where it is.`);
    customer.services.push({
      ref,
      row: s.row,
      subscription: s.subscription,
      odooProduct: s.product,
      productSlug: choice.slug,
      productName: choice.name,
      legacy: choice.legacy,
      quantity: qty,
      billingQuantity: perUnit ? qty : 1,
      cycle,
      recurringMinor: recurring.toString(),
      registeredOn: toDateOnly(registeredOn),
      nextDueOn: toDateOnly(nextDue),
      reviewOn: reviewOn ? toDateOnly(reviewOn) : null,
      domain,
      hostedAt: hosting.at,
      hostServer: orNull(s.hostServer),
      hostNotes: [hosting.provider ? `Provider: ${hosting.provider}.` : "", s.hostNotes.trim()].filter(Boolean).join(" ") || null,
      done: !!doneRef("service", ref),
    });
  }

  // Domains.
  const seenDomains = new Set<string>();
  for (const d of source.domains) {
    const name = d.name.trim().toLowerCase();
    const at = (message: string) => problem("domains", d.row, `${name || "(blank)"}: ${message}`);
    if (!DOMAIN_PATTERN.test(name)) {
      at("isn't a domain name.");
      continue;
    }
    if (seenDomains.has(name)) {
      at("is on more than one row.");
      continue;
    }
    seenDomains.add(name);
    const customerRef = customerFor("domains", d.row, d.customerRef, d.customerName);
    const customer = customerRef ? customerPlan(customerRef) : null;
    if (!customer) continue;
    if (!tlds.some((t) => name.endsWith(t.tld))) {
      at("we don't sell this ending, so billing can't renew it. Leave it out, or have the ending added to the catalogue first.");
      continue;
    }
    const expires = readDate(d.expiresOn);
    if (!expires) {
      at(`the expiry date "${d.expiresOn}" isn't a date.`);
      continue;
    }
    if (expires <= today) {
      at(`it expired on ${formatDay(expires, true)}. Renew it at the registrar first, or leave it out.`);
      continue;
    }
    const years = d.years ? Number(d.years) : 1;
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      at(`"${d.years}" years isn't between 1 and 10.`);
      continue;
    }
    const renewal = readDecimal(d.renewal);
    if (renewal === null || renewal < 0n) {
      at(`the renewal price "${d.renewal}" isn't an amount.`);
      continue;
    }
    const registered = d.registeredOn ? readDate(d.registeredOn) : addMonths(expires, -12 * years);
    if (!registered || registered >= expires) {
      at(`the registration date "${d.registeredOn}" isn't a date before it expires.`);
      continue;
    }
    customer.domains.push({
      ref: name,
      row: d.row,
      name,
      registrar: d.registrar.trim(),
      registeredOn: toDateOnly(registered),
      expiresOn: toDateOnly(expires),
      renewalMinor: toMinor(renewal, customer.currency).toString(),
      years,
      autoRenew: !/^(no|n|false|0|off)$/i.test(d.autoRenew.trim()),
      done: !!doneRef("domain", name),
    });
  }

  // Unpaid invoices become opening balances.
  for (const i of source.invoices) {
    const at = (message: string) => problem("invoices", i.row, `${i.number || "(no number)"}: ${message}`);
    if (/refund|credit/i.test(i.type)) {
      warn("invoices", i.row, `${i.number} is a credit note. Credits don't come over: add it to the customer's account in billing by hand.`);
      continue;
    }
    const due = readDecimal(i.amountDue);
    if (due === null) {
      at(`the amount due "${i.amountDue}" isn't an amount.`);
      continue;
    }
    if (due <= 0n) {
      skipped++;
      continue;
    }
    if (!i.number) {
      at("no invoice number.");
      continue;
    }
    const customerRef = customerFor("invoices", i.row, i.customerRef, i.customerName);
    const customer = customerRef ? customerPlan(customerRef) : null;
    if (!customer) continue;
    if (i.currency && i.currency.trim().toUpperCase() !== customer.currency) {
      at(`it is in ${i.currency}, but ${customer.name} will be billed in ${customer.currency}.`);
      continue;
    }
    const issued = readDate(i.date);
    const dueOn = readDate(i.dueDate) ?? (issued ? addDays(issued, 0) : null);
    if (!issued || !dueOn) {
      at(`the invoice date "${i.date}" or due date "${i.dueDate}" isn't a date.`);
      continue;
    }
    const total = i.total ? readDecimal(i.total) : null;
    const part = total !== null && total > due;
    customer.invoices.push({
      ref: i.number,
      row: i.row,
      number: i.number,
      issuedOn: toDateOnly(issued),
      dueOn: toDateOnly(dueOn),
      amountMinor: toMinor(due, customer.currency).toString(),
      description: `${part ? "Balance still owed on" : "Brought forward:"} invoice ${i.number} of ${formatDay(issued, true)}`,
      done: !!doneRef("invoice", i.number),
    });
  }

  // People for every customer that has something to bring over.
  const customers = [...planned.values()];
  const emails = [...new Set(customers.flatMap((c) => [c.email, ...(contactsOf.get(c.ref) ?? []).map((p) => cleanEmail(p.email))]).filter((e): e is string => !!e))];
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, kind: true, memberships: { where: { role: "OWNER", active: true }, select: { organisationId: true, organisation: { select: { name: true } } } } },
  });
  const importedOrgs = new Set(records.filter((r) => r.kind === "customer").map((r) => r.targetId));
  for (const c of customers) {
    const people: PlannedPerson[] = [];
    for (const p of contactsOf.get(c.ref) ?? []) {
      const email = cleanEmail(p.email);
      if (!email) {
        if (p.email.trim()) warn("contacts", p.row, `${p.name}'s email "${p.email}" isn't valid, so they are left out.`);
        continue;
      }
      if (people.some((x) => x.email === email)) continue;
      const role = p.role ? ROLES[p.role.trim().toLowerCase()] : undefined;
      if (p.role && !role) problem("contacts", p.row, `${p.name}: the console role "${p.role}" isn't Owner, Admin, Billing or Read only.`);
      people.push({ ref: `${c.ref}:${email}`, name: p.name.trim() || email, email, role: role ?? (p.type.toLowerCase().startsWith("invoice") ? "BILLING" : "READ_ONLY"), existingUser: false });
      if (p.type.toLowerCase().startsWith("invoice") && !c.billingEmail) c.billingEmail = email;
    }
    if (c.email && !people.some((x) => x.email === c.email)) people.unshift({ ref: `${c.ref}:${c.email}`, name: c.name, email: c.email, role: "READ_ONLY", existingUser: false });
    if (!people.some((p) => p.role === "OWNER")) {
      const owner = people.find((p) => p.email === c.email) ?? people.find((p) => p.role !== "BILLING") ?? people[0];
      if (owner) owner.role = "OWNER";
    }
    if (!people.length && !c.organisationId) problem("customers", c.row, `${c.name} has no email, for them or any contact person, so nobody could sign in. Add one in Odoo and export again.`);
    for (const p of people) {
      const user = users.find((u) => u.email === p.email);
      if (!user) continue;
      p.existingUser = true;
      if (user.kind !== "CUSTOMER") problem("contacts", undefined, `${p.email} is one of our staff sign-ins, so it can't be a customer's. Use another email for ${c.name}.`);
      const own = user.memberships.find((m) => !importedOrgs.has(m.organisationId));
      if (p.role === "OWNER" && own && !c.organisationId) problem("customers", c.row, `${p.email} already owns the console account ${own.organisation.name}. Leave ${c.name} out of the files and add their services to that account by hand, or close that account first.`);
    }
    c.billingEmail ??= people.find((p) => p.role === "OWNER")?.email ?? c.email;
    c.people = people;
  }

  // Customers with nothing running and nothing owed don't come over.
  const active = customers.filter((c) => c.services.length || c.domains.length || c.invoices.length);
  const listed = source.customers.length - active.length;
  if (listed > 0) warn("customers", undefined, `${listed} ${listed === 1 ? "customer has" : "customers have"} no running subscription, domain or unpaid invoice in these files, so ${listed === 1 ? "it isn't" : "they aren't"} brought over.`);

  const monthly: Record<string, bigint> = {};
  const opening: Record<string, bigint> = {};
  let earliest: string | null = null;
  for (const c of active) {
    for (const s of c.services.filter((x) => !x.done)) {
      monthly[c.currency] = (monthly[c.currency] ?? 0n) + divRound(BigInt(s.recurringMinor), BigInt(CYCLE_MONTHS[s.cycle]));
      if (!earliest || s.nextDueOn < earliest) earliest = s.nextDueOn;
    }
    for (const d of c.domains.filter((x) => !x.done)) if (!earliest || d.expiresOn < earliest) earliest = d.expiresOn;
    for (const i of c.invoices.filter((x) => !x.done)) opening[c.currency] = (opening[c.currency] ?? 0n) + BigInt(i.amountMinor);
  }
  const all = active.flatMap((c) => [...c.services, ...c.domains, ...c.invoices]);
  const asStrings = (m: Record<string, bigint>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toString()]));

  return {
    customers: active.sort((a, b) => a.name.localeCompare(b.name)),
    products: [...choices.values()].sort((a, b) => a.odooProduct.localeCompare(b.odooProduct)),
    problems,
    warnings,
    monthly: asStrings(monthly),
    openingBalances: asStrings(opening),
    earliestDue: earliest,
    counts: {
      customers: active.filter((c) => !c.organisationId).length,
      people: active.filter((c) => !c.organisationId).reduce((n, c) => n + c.people.length, 0),
      services: active.reduce((n, c) => n + c.services.filter((s) => !s.done).length, 0),
      domains: active.reduce((n, c) => n + c.domains.filter((s) => !s.done).length, 0),
      invoices: active.reduce((n, c) => n + c.invoices.filter((s) => !s.done).length, 0),
      done: all.filter((x) => x.done).length,
      skipped,
    },
  };
}

/** The fingerprint an admin approves: any change to what would be written changes it. */
export function reportHash(report: PlanReport) {
  return createHash("sha256").update(JSON.stringify({ customers: report.customers, products: report.products })).digest("hex");
}
