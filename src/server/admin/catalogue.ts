import type { CatalogueStatus, ConnectorFamily, Fulfilment, Prisma, PrismaClient, Product } from "@prisma/client";
import { currencyInfo, parseMoney } from "@/lib/domain/money";
import { parsePercent, nextMonth } from "@/server/admin/pricing";
import { productItem } from "@/server/catalogue/price-book";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { effectiveStatus, STATUS_LABEL } from "@/server/catalogue/visibility";
import { connectorFor } from "@/server/connectors/registry";
import { DomainError } from "@/server/org/access";
import { isLegacyCategory, LEGACY_FAMILY } from "@/server/catalogue/legacy";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { prepareLaunchKit } from "@/server/launch/kits";

/**
 * The staff Catalogue: product families (each fulfilled by one connector),
 * their categories and products. Prices stay in the price books; a product
 * needs an approved price in every market it is offered in before it can
 * be internal or live, unless it is sold by quote. Every change is in the
 * staff audit log with the fields before and after.
 */

export interface CatalogueDeps {
  db: PrismaClient;
  staff: StaffActor;
  /** This month, "2026-09": prices approved up to next month count. */
  month: string;
}

export const CONNECTOR_LABEL: Record<ConnectorFamily, string> = {
  PRODUCTIVITY: "Productivity (Microsoft 365, Google Workspace)",
  PUBLIC_CLOUD: "Public cloud (Azure)",
  SERVERS: "Servers",
  WEB_AND_DOMAINS: "Web, email and domains",
  PROTECTION: "Protection (backup, recovery, monitoring)",
  OUR_SOFTWARE: "Our software",
  SERVICES: "Services",
  CONNECTIVITY: "Connectivity",
};

const FULFILMENT_WORDS: Record<Fulfilment, string> = { AUTOMATIC: "with automatic setup", MANUAL: "with setup by our team", QUOTE: "by quote" };

export const FULFILMENT_LABEL: Record<Fulfilment, string> = { AUTOMATIC: "Automatic", MANUAL: "Manual (a staff task)", QUOTE: "Request a quote" };

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUSES: CatalogueStatus[] = ["DRAFT", "INTERNAL", "LIVE"];
const FULFILMENTS: Fulfilment[] = ["AUTOMATIC", "MANUAL", "QUOTE"];

// ─── Reading ─────────────────────────────────────────────────────────

/** Every family, category and product, with where each product is priced and whether billing knows it. */
export async function catalogueTree(db: PrismaClient, month: string) {
  const [families, markets, entries] = await Promise.all([
    db.productFamily.findMany({
      orderBy: { sortOrder: "asc" },
      include: { categories: { orderBy: { sortOrder: "asc" }, include: { products: { where: { slug: { not: DOMAIN_PRODUCT_SLUG } }, orderBy: { sortOrder: "asc" } } } } },
    }),
    db.market.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true, name: true, currency: true, enabled: true } }),
    db.priceBookEntry.findMany({ where: { item: { startsWith: "product:" }, month: { lte: nextMonth(month) } }, select: { item: true, marketCode: true, currency: true } }),
  ]);
  const priced = pricedIn(entries, markets);
  return {
    markets,
    families: families.map((f) => ({
      ...f,
      categories: f.categories.map((c) => ({
        ...c,
        products: c.products.map((p) => ({ ...p, shown: effectiveStatus(p, f), pricedIn: priced(p.slug), unpriced: p.markets.filter((m) => !priced(p.slug).includes(m)) })),
      })),
    })),
  };
}

function pricedIn(entries: { item: string; marketCode: string; currency: string }[], markets: { code: string; currency: string }[]) {
  const currency = new Map(markets.map((m) => [m.code, m.currency]));
  return (slug: string) => [...new Set(entries.filter((e) => e.item === productItem(slug) && currency.get(e.marketCode) === e.currency).map((e) => e.marketCode))];
}

/** Markets a product is offered in that have no approved price for this month or next. */
async function unpricedMarkets(db: PrismaClient, slug: string, markets: string[], month: string) {
  const [all, entries] = await Promise.all([
    db.market.findMany({ select: { code: true, currency: true } }),
    db.priceBookEntry.findMany({ where: { item: productItem(slug), month: { lte: nextMonth(month) } }, select: { item: true, marketCode: true, currency: true } }),
  ]);
  const priced = pricedIn(entries, all)(slug);
  return markets.filter((m) => !priced.includes(m));
}

// ─── Audit ───────────────────────────────────────────────────────────

type Plain = string | number | boolean | null | string[];

function changes<T extends Record<string, Plain>>(before: Partial<T> | null, after: T) {
  const keys = Object.keys(after).filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after[k]));
  return {
    keys,
    before: before ? Object.fromEntries(keys.map((k) => [k, before[k] ?? null])) : null,
    after: Object.fromEntries(keys.map((k) => [k, after[k]])),
  };
}

async function audit(tx: Prisma.TransactionClient, staff: StaffActor, action: string, summary: string, data: Record<string, unknown>) {
  await tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staffLabel(staff), action, summary, data: data as Prisma.InputJsonValue } });
}

// ─── Families ────────────────────────────────────────────────────────

export interface FamilyInput {
  key: string;
  name: string;
  description: string;
  connector: string;
  status: string;
  /** "" lets each product choose; otherwise every product is sold this way. */
  fulfilment?: string;
  sortOrder: string;
}

function text(input: string, field: string, label: string, max: number, errors: Record<string, string>, required = true) {
  const v = input.trim().replace(/\s+/g, " ");
  if (required && !v) errors[field] = `Enter ${label}.`;
  else if (v.length > max) errors[field] = `Keep ${label} to ${max} characters.`;
  return v;
}

function whole(input: string, field: string, label: string, min: number, max: number, errors: Record<string, string>) {
  const s = input.trim();
  const n = Number(s);
  if (!/^\d+$/.test(s) || n < min || n > max) errors[field] = `Enter ${label} from ${min} to ${max}.`;
  return n;
}

function check(errors: Record<string, string>) {
  const first = Object.values(errors)[0];
  if (first) throw new DomainError("invalid", first, undefined, errors);
}

export async function saveFamily(deps: CatalogueDeps, input: FamilyInput, existingKey?: string) {
  assertStaffCan(deps.staff, "manageCatalogue");
  const errors: Record<string, string> = {};
  const key = existingKey ?? input.key.trim().toLowerCase();
  if (!existingKey && !KEY.test(key)) errors.key = "Use lowercase letters, numbers and dashes, like web-and-domains.";
  const data = {
    name: text(input.name, "name", "a name", 60, errors),
    description: text(input.description, "description", "a description", 200, errors),
    connector: input.connector as ConnectorFamily,
    status: input.status as CatalogueStatus,
    fulfilment: (input.fulfilment || null) as Fulfilment | null,
    sortOrder: whole(input.sortOrder || "0", "sortOrder", "a position", 0, 999, errors),
  };
  if (!(input.connector in CONNECTOR_LABEL)) errors.connector = "Choose the connector that fulfils this family.";
  if (data.fulfilment && !FULFILMENTS.includes(data.fulfilment)) errors.fulfilment = "Choose how its products are sold.";
  else if (data.fulfilment === "AUTOMATIC" && data.connector in CONNECTOR_LABEL && !connectorFor(data.connector).automatic) {
    errors.fulfilment = `The ${CONNECTOR_LABEL[data.connector]} connector can't set products up by itself yet.`;
  }
  if (!STATUSES.includes(data.status)) errors.status = "Choose a status.";
  else if (key === LEGACY_FAMILY && data.status !== "DRAFT") errors.status = "Legacy services are never offered, so they stay a draft.";
  check(errors);

  return deps.db.$transaction(async (tx) => {
    const before = existingKey ? await tx.productFamily.findUnique({ where: { key: existingKey } }) : null;
    if (existingKey && !before) throw new DomainError("not-found", "That family doesn't exist.");
    if (!existingKey && (await tx.productFamily.findUnique({ where: { key } }))) throw new DomainError("conflict", "A family already has that key.", "key");
    const diff = changes(before, data);
    if (before && !diff.keys.length) return { key, changed: 0 };
    const family = before ? await tx.productFamily.update({ where: { key }, data }) : await tx.productFamily.create({ data: { key, ...data } });
    await audit(tx, deps.staff, before ? "catalogue.family-updated" : "catalogue.family-created", `${before ? "Changed" : "Added"} the product family ${family.name}`, { family: key, ...diff });
    return { key, changed: diff.keys.length };
  });
}

// ─── Categories ──────────────────────────────────────────────────────

export interface CategoryInput {
  key: string;
  name: string;
  description: string;
  familyKey: string;
  sortOrder: string;
  /** Only when adding one; after that the margin is changed on the Pricing page. */
  margin?: string;
}

export async function saveCategory(deps: CatalogueDeps, input: CategoryInput, existingKey?: string) {
  assertStaffCan(deps.staff, "manageCatalogue");
  const errors: Record<string, string> = {};
  const key = existingKey ?? input.key.trim().toLowerCase();
  if (!existingKey && !KEY.test(key)) errors.key = "Use lowercase letters, numbers and dashes, like backups.";
  const data = {
    name: text(input.name, "name", "a name", 60, errors),
    description: text(input.description, "description", "a description", 200, errors),
    familyKey: input.familyKey,
    sortOrder: whole(input.sortOrder || "0", "sortOrder", "a position", 0, 999, errors),
  };
  let marginBps = 0;
  if (!existingKey) {
    try {
      marginBps = parsePercent(input.margin ?? "", "margin");
    } catch (e) {
      if (e instanceof DomainError) errors.margin = e.message;
      else throw e;
    }
  }
  if (!(await deps.db.productFamily.findUnique({ where: { key: data.familyKey } }))) errors.familyKey = "Choose a family.";
  check(errors);

  return deps.db.$transaction(async (tx) => {
    const before = existingKey ? await tx.productCategory.findUnique({ where: { key: existingKey }, select: { name: true, description: true, familyKey: true, sortOrder: true } }) : null;
    if (existingKey && !before) throw new DomainError("not-found", "That category doesn't exist.");
    if (!existingKey && (await tx.productCategory.findUnique({ where: { key } }))) throw new DomainError("conflict", "A category already has that key.", "key");
    const diff = changes(before, data);
    if (before && !diff.keys.length) return { key, changed: 0 };
    const category = before ? await tx.productCategory.update({ where: { key }, data }) : await tx.productCategory.create({ data: { key, ...data, marginBps } });
    await audit(tx, deps.staff, before ? "catalogue.category-updated" : "catalogue.category-created", `${before ? "Changed" : "Added"} the category ${category.name}`, {
      category: key,
      ...diff,
      ...(before ? {} : { marginBps }),
    });
    return { key, changed: diff.keys.length };
  });
}

// ─── Products ────────────────────────────────────────────────────────

export interface ProductInput {
  slug: string;
  name: string;
  summary: string;
  includes: string;
  excludes: string;
  categoryKey: string;
  unitLabel: string;
  quantityAllowed: boolean;
  minQuantity: string;
  setupHours: string;
  minTermMonths: string;
  commitmentNote: string;
  cost: string;
  costCurrency: string;
  fixedPrice: string;
  fixedPriceCurrency: string;
  markets: string[];
  fulfilment: string;
  status: string;
  sortOrder: string;
}

/** The fields a product form edits, as stored. */
const EDITABLE = [
  "name",
  "summary",
  "includes",
  "excludes",
  "categoryKey",
  "unitLabel",
  "quantityAllowed",
  "minQuantity",
  "setupHours",
  "minTermMonths",
  "commitmentNote",
  "costMinor",
  "costCurrency",
  "fixedPriceMinor",
  "fixedPriceCurrency",
  "markets",
  "fulfilment",
  "status",
  "sortOrder",
] as const;

type ProductFields = Pick<Product, (typeof EDITABLE)[number]>;

const lines = (input: string, field: string, errors: Record<string, string>) => {
  const list = input
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
  if (list.length > 12) errors[field] = "Keep it to 12 lines.";
  else if (list.some((l) => l.length > 140)) errors[field] = "Keep each line to 140 characters.";
  return list;
};

/** For the audit log: amounts as strings, since JSON has no big integers. */
const plain = (p: ProductFields): Record<string, Plain> =>
  Object.fromEntries(EDITABLE.map((k) => [k, typeof p[k] === "bigint" ? String(p[k]) : (p[k] as Plain)]));

export async function saveProduct(deps: CatalogueDeps, input: ProductInput, existingSlug?: string) {
  assertStaffCan(deps.staff, "manageCatalogue");
  const errors: Record<string, string> = {};
  const slug = existingSlug ?? input.slug.trim().toLowerCase();
  if (!existingSlug && !KEY.test(slug)) errors.slug = "Use lowercase letters, numbers and dashes, like vps-small. It becomes the product's address.";
  const [category, markets] = await Promise.all([
    deps.db.productCategory.findUnique({ where: { key: input.categoryKey }, include: { family: true } }),
    deps.db.market.findMany({ select: { code: true, currency: true } }),
  ]);
  const currencies = new Set([...markets.map((m) => m.currency), "USD"]);
  const amount = (raw: string, currency: string, field: string, required: boolean): bigint | null => {
    if (!raw.trim()) {
      if (required) errors[field] = "Enter an amount.";
      return null;
    }
    if (!currencies.has(currency)) {
      errors[`${field}Currency`] = "Choose a currency.";
      return null;
    }
    try {
      const minor = parseMoney(raw, currency);
      if (minor < 0n) errors[field] = "An amount can't be negative.";
      return minor;
    } catch {
      errors[field] = `Enter an amount like ${(1234.5).toFixed(currencyInfo(currency).exponent)}.`;
      return null;
    }
  };

  const fields: ProductFields = {
    name: text(input.name, "name", "a name", 80, errors),
    summary: text(input.summary, "summary", "a summary", 200, errors),
    includes: lines(input.includes, "includes", errors),
    excludes: lines(input.excludes, "excludes", errors),
    categoryKey: input.categoryKey,
    unitLabel: text(input.unitLabel, "unitLabel", "what one unit is, like per user", 30, errors),
    quantityAllowed: input.quantityAllowed,
    minQuantity: whole(input.minQuantity || "1", "minQuantity", "a smallest quantity", 1, 500, errors),
    setupHours: whole(input.setupHours, "setupHours", "the setup time in working hours", 0, 2000, errors),
    minTermMonths: whole(input.minTermMonths || "1", "minTermMonths", "a minimum term in months", 1, 60, errors),
    commitmentNote: text(input.commitmentNote, "commitmentNote", "the terms", 300, errors, false) || null,
    costMinor: amount(input.cost, input.costCurrency, "cost", true) ?? 0n,
    costCurrency: input.costCurrency,
    fixedPriceMinor: amount(input.fixedPrice, input.fixedPriceCurrency, "fixedPrice", false),
    fixedPriceCurrency: input.fixedPrice.trim() ? input.fixedPriceCurrency : null,
    markets: [...new Set(input.markets)].filter((m) => markets.some((x) => x.code === m)),
    fulfilment: input.fulfilment as Fulfilment,
    status: input.status as CatalogueStatus,
    sortOrder: whole(input.sortOrder || "0", "sortOrder", "a position", 0, 999, errors),
  };
  if (!category) errors.categoryKey = "Choose a category.";
  if (!FULFILMENTS.includes(fields.fulfilment)) errors.fulfilment = "Choose how it is fulfilled.";
  if (!STATUSES.includes(fields.status)) errors.status = "Choose a status.";
  else if (category && isLegacyCategory(category.key) && fields.status !== "DRAFT") errors.status = "Legacy services are never offered, so they stay a draft.";
  if (!fields.quantityAllowed) fields.minQuantity = 1;
  if (category?.family.fulfilment && fields.fulfilment !== category.family.fulfilment) {
    errors.fulfilment = `Everything in ${category.family.name} is sold ${FULFILMENT_WORDS[category.family.fulfilment]}.`;
  } else if (category && fields.fulfilment === "AUTOMATIC" && !connectorFor(category.family.connector).automatic) {
    errors.fulfilment = `The ${CONNECTOR_LABEL[category.family.connector]} connector can't set products up by itself yet. Choose manual.`;
  }
  if (fields.status !== "DRAFT") {
    if (!fields.markets.length) errors.markets = `Choose at least one market before making it ${STATUS_LABEL[fields.status].toLowerCase()}.`;
    else if (fields.fulfilment !== "QUOTE" && !errors.markets) {
      const missing = await unpricedMarkets(deps.db, slug, fields.markets, deps.month);
      if (missing.length) {
        errors.status = `Approve a price in ${missing.map((m) => m.toUpperCase()).join(", ")} on the Pricing page first, or keep it a draft.`;
      }
    }
  }
  check(errors);

  return deps.db.$transaction(async (tx) => {
    const before = existingSlug ? await tx.product.findUnique({ where: { slug: existingSlug } }) : null;
    if (existingSlug && !before) throw new DomainError("not-found", "That product doesn't exist.");
    if (existingSlug === DOMAIN_PRODUCT_SLUG) throw new DomainError("invalid", "Domain names are managed on the Pricing page.");
    if (!existingSlug && (await tx.product.findUnique({ where: { slug } }))) throw new DomainError("conflict", "A product already has that address.", "slug");
    const diff = changes(before ? plain(before) : null, plain(fields));
    if (before && !diff.keys.length) return { slug, changed: 0, launched: false };
    const product = before ? await tx.product.update({ where: { slug }, data: fields }) : await tx.product.create({ data: { slug, ...fields } });
    const statusChanged = before && before.status !== product.status;
    // A product going live gets a launch kit (Milestone 7): drafts follow from a job.
    const launched = product.status === "LIVE" && (!before || statusChanged) ? await prepareLaunchKit(tx, product) : false;
    await audit(
      tx,
      deps.staff,
      !before ? "catalogue.product-created" : statusChanged ? "catalogue.product-status" : "catalogue.product-updated",
      !before
        ? `Added the product ${product.name} (${STATUS_LABEL[product.status].toLowerCase()})`
        : statusChanged
          ? `Made ${product.name} ${STATUS_LABEL[product.status].toLowerCase()}`
          : `Changed the product ${product.name}`,
      { product: slug, ...diff },
    );
    return { slug, changed: diff.keys.length, launched };
  });
}

/** Marks an organisation as our own test account, so its members see and can order internal products. */
export async function setInternalOrganisation(deps: Pick<CatalogueDeps, "db" | "staff">, organisationId: string, internal: boolean) {
  assertStaffCan(deps.staff, "manageCatalogue");
  return deps.db.$transaction(async (tx) => {
    const org = await tx.organisation.findUnique({ where: { id: organisationId } });
    if (!org || org.deletedAt) throw new DomainError("not-found", "That customer doesn't exist.");
    if (org.internal === internal) return;
    await tx.organisation.update({ where: { id: organisationId }, data: { internal } });
    await audit(tx, deps.staff, "catalogue.test-organisation", internal ? `Made ${org.name} one of our test organisations` : `Made ${org.name} an ordinary customer again`, {
      organisationId,
      before: { internal: org.internal },
      after: { internal },
    });
  });
}

/** Catalogue changes for the activity list on the Catalogue page. */
export const catalogueChanges = (db: PrismaClient, take = 20) =>
  db.staffAuditEvent.findMany({ where: { action: { startsWith: "catalogue." } }, orderBy: { createdAt: "desc" }, take });
