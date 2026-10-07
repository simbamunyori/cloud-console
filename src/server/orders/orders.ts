import { randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { todayIn } from "@/lib/dates";
import { divRound, money, times, type Money } from "@/lib/domain/money";
import { priceDay } from "@/lib/domain/pricing";
import { BillingError, PAYMENT_METHODS, type DomainAvailability, type UpgradePreview } from "@/server/billing/adapter";
import type { ScopedBilling } from "@/server/billing/scoped";
import { approvedPrice, productItem, productPrice, tldOffers } from "@/server/catalogue/price-book";
import { productBySlug, productOptions, validateOptions, type ProductWithCategory } from "@/server/catalogue/catalogue";
import { startProtection } from "@/server/backup/backup";
import { MANAGED_SECURITY_PRODUCTS, managedSecurityOn, startTenant } from "@/server/soc/soc";
import { activeProvider } from "@/server/soc/providers";
import { includedToSetUp } from "@/server/catalogue/inclusions";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { audienceFor } from "@/server/catalogue/visibility";
import { connectorFor } from "@/server/connectors/registry";
import { isThebePlan, recordThebeOrder } from "@/server/thebe/thebe";
import { AUTOMATIC_DOMAIN_HOURS } from "@/server/domains/registrar";
import { prisma, type TenantDb } from "@/server/db";
import { pushQuantity } from "@/server/licences/automation";
import { queueEmail } from "@/server/email/outbox";
import { assertSeatFloor, licenceForService } from "@/server/licences/licences";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { hasLegalText } from "@/server/cms/legal";
import { legacyPrice } from "@/server/migration/services";

/**
 * Ordering: new products, seat changes on an existing service, and domain
 * names. Each one is priced from the catalogue, sent to the billing engine
 * (which raises the invoice), recorded as an Order, handed to the product
 * family's connector (a staff task in Phase 1), written to the audit log
 * and confirmed by email.
 */

export interface OrderDeps {
  db: TenantDb;
  billing: ScopedBilling;
  organisation: { id: string; name: string; currency: string; timeZone: string; billingMarket: string; /** Our own test organisation: can order internal products. */ internal?: boolean };
  actor: Actor;
  now?: Date;
}

export const MAX_QUANTITY = 500;
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A short reference people can read out, e.g. "ORD-7K2M9Q". */
export function newReference(prefix = "ORD"): string {
  return `${prefix}-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("")}`;
}

const catalogueDb = (db: TenantDb) => db as unknown as PrismaClient;
const marketOf = (deps: Pick<OrderDeps, "organisation">) => ({ code: deps.organisation.billingMarket, currency: deps.organisation.currency });

export function billingFailure(e: unknown): never {
  if (e instanceof BillingError) {
    if (e.code === "invalid" || e.code === "conflict") throw new DomainError("invalid", e.message);
    throw new DomainError("unavailable", "Billing is not answering right now, so nothing was ordered. Try again in a few minutes.");
  }
  throw e;
}

function parseQuantity(product: ProductWithCategory, raw: string | number): number {
  if (!product.quantityAllowed) return 1;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < product.minQuantity || n > MAX_QUANTITY) {
    throw new DomainError("invalid", `Choose between ${product.minQuantity} and ${MAX_QUANTITY}.`, "quantity");
  }
  return n;
}

/** "per user" and 3 gives "users". */
export function unitNoun(unitLabel: string, quantity: number) {
  const noun = unitLabel.replace(/^per /, "");
  return quantity === 1 ? noun : `${noun}s`;
}

async function placerEmail(db: TenantDb, userId: string) {
  return (await catalogueDb(db).user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })).email;
}

export interface OrderQuote {
  product: ProductWithCategory & { billingProductId: string };
  quantity: number;
  unitPrice: Money;
  monthlyTotal: Money;
  options: Record<string, string>;
}

/** Works out what an order would cost, checking everything the customer chose. */
export async function quoteOrder(deps: OrderDeps, input: { slug: string; quantity: string | number; options: Record<string, string> }): Promise<OrderQuote> {
  const audience = audienceFor(deps.organisation);
  const product = await productBySlug(catalogueDb(deps.db), input.slug, audience);
  if (!product || product.slug === DOMAIN_PRODUCT_SLUG) throw new DomainError("not-found", "That product isn't on sale.");
  if (product.fulfilment === "QUOTE") throw new DomainError("invalid", "This is sold by quote. Ask us for a quote instead of ordering it.");
  const { billingProductId } = product;
  if (!billingProductId) throw new DomainError("unavailable", "This can't be ordered yet. Contact support and we'll set it up for you.");
  const quantity = parseQuantity(product, input.quantity);
  const options = validateOptions(productOptions(product), input.options);
  const month = priceDay(todayIn(deps.organisation.timeZone, deps.now));
  const unitPrice = await productPrice(catalogueDb(deps.db), product, marketOf(deps), month, audience);
  if (!unitPrice) throw new DomainError("not-found", "That product isn't on sale.");
  return { product: { ...product, billingProductId }, quantity, unitPrice, monthlyTotal: times(unitPrice, quantity), options };
}

/**
 * Where the market has a refunds policy, the customer confirms the service may start
 * straight away, which ends the consumer cooling-off period (refunds policy, section 1).
 */
export async function assertStartNow(deps: OrderDeps, startNow: boolean | undefined) {
  if (startNow || !(await hasLegalText(deps.organisation.billingMarket, "refunds"))) return;
  throw new DomainError("invalid", "Confirm that the service can start now.", "startNow");
}

/** Places a new order. The first month is invoiced now. */
export async function placeOrder(deps: OrderDeps, input: { slug: string; quantity: string | number; options: Record<string, string>; startNow?: boolean }) {
  assertCan(deps.actor, "order");
  const quote = await quoteOrder(deps, input);
  await assertStartNow(deps, input.startNow);
  const { product, quantity } = quote;
  const specs = productOptions(product);
  const labelled = Object.fromEntries(specs.filter((s) => quote.options[s.key]).map((s) => [s.label, quote.options[s.key]]));

  const placed = await deps.billing
    .placeOrder({
      paymentMethod: PAYMENT_METHODS.eft,
      createInvoice: true,
      items: [{ productId: product.billingProductId, quantity, billingCycle: "monthly", recurringPrice: quote.monthlyTotal, domain: quote.options.domain, options: labelled }],
    })
    .catch(billingFailure);

  const now = deps.now ?? new Date();
  const email = await placerEmail(deps.db, deps.actor.userId);
  const included = await includedToSetUp(catalogueDb(deps.db), product.id);
  // STRATEGY_ROLLOUT U5: managed security starts a tenant with the active provider once it is published.
  const securityProvider = MANAGED_SECURITY_PRODUCTS.includes(product.slug) && (await managedSecurityOn(catalogueDb(deps.db))) ? await activeProvider(catalogueDb(deps.db)) : null;
  return deps.db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        reference: newReference(),
        organisationId: deps.organisation.id,
        productId: product.id,
        quantity,
        options: labelled,
        unitPriceMinor: quote.unitPrice.amountMinor,
        currency: quote.unitPrice.currency,
        monthlyTotalMinor: quote.monthlyTotal.amountMinor,
        expectedBy: now,
        placedById: deps.actor.userId,
        billingOrderId: placed.orderId,
        billingServiceIds: placed.serviceIds,
        billingInvoiceId: placed.invoiceId ?? null,
      },
    });
    const result = await connectorFor(product.category.family.connector).request(
      tx,
      {
        organisationId: deps.organisation.id,
        organisationName: deps.organisation.name,
        orderId: order.id,
        orderReference: order.reference,
        work: "provision",
        productName: product.name,
        quantity,
        options: labelled,
        billingIds: placed.serviceIds,
        setupHours: product.setupHours,
      },
      now,
    );
    // STRATEGY_ROLLOUT U3: what the product includes is set up with it, at no extra charge, so it has no billing ids of its own.
    for (const i of included) {
      await connectorFor(i.included.category.family.connector).request(
        tx,
        {
          organisationId: deps.organisation.id,
          organisationName: deps.organisation.name,
          orderId: order.id,
          orderReference: order.reference,
          work: "provision",
          productName: `${i.included.name} (included with ${product.name})`,
          quantity: i.quantity * (product.quantityAllowed ? quantity : 1),
          options: labelled,
          billingIds: [],
          setupHours: i.included.setupHours,
        },
        now,
      );
      await startProtection(tx, { organisationId: deps.organisation.id, productSlug: i.included.slug, productName: i.included.name, reference: `included:${order.reference}:${i.included.slug}` });
    }
    await startTenant(tx, { organisationId: deps.organisation.id, productSlug: product.slug, providerId: securityProvider?.id ?? null });
    // STRATEGY_ROLLOUT U10: a Thebe plan creates the customer's Thebe organisation once the order is in.
    if (isThebePlan(product.slug)) await recordThebeOrder(tx, { organisationId: deps.organisation.id, plan: product.slug, users: quantity, orderId: order.id, taskId: result.taskId ?? null });
    // An off-site backup shows on the customer's Backup page from the order on.
    await startProtection(tx, { organisationId: deps.organisation.id, productSlug: product.slug, productName: product.name, reference: placed.serviceIds[0] ?? `order:${order.reference}` });
    const updated = await tx.order.update({ where: { id: order.id }, data: { expectedBy: result.expectedBy } });
    await audit(
      tx,
      customerAudit(deps.actor, deps.organisation.id, {
        action: "order.placed",
        summary: `Ordered ${product.name}${product.quantityAllowed ? ` for ${quantity} ${unitNoun(product.unitLabel, quantity)}` : ""} (${order.reference})`,
        targetType: "Order",
        targetId: order.id,
        data: { startNow: Boolean(input.startNow) },
      }),
    );
    await queueEmail(tx, { organisationId: deps.organisation.id, to: email, kind: "order.received", payload: { orderId: order.id } });
    return updated;
  });
}

// ─── Changing the number of users on a service ──────────────────────

export interface QuantityChange {
  serviceId: string;
  serviceName: string;
  from: number;
  to: number;
  unitPrice: Money;
  preview: UpgradePreview;
}

async function quantityChange(deps: OrderDeps, serviceId: string, rawQuantity: string | number): Promise<QuantityChange & { product: ProductWithCategory }> {
  const service = await deps.billing.getService(serviceId);
  if (!service) throw new DomainError("not-found", "That service isn't on your account.");
  if (service.status !== "active") throw new DomainError("conflict", "Only an active service can be changed.");
  const product = await catalogueDb(deps.db).product.findFirst({ where: { billingProductId: service.productId }, include: { category: { include: { family: true } } } });
  if (!product || !product.quantityAllowed) throw new DomainError("invalid", "The number of users can't be changed for this service. Contact support to change it.");
  const to = parseQuantity(product, rawQuantity);
  if (to === service.quantity) throw new DomainError("invalid", `It already has ${to}.`, "quantity");
  // Seats never drop below the licences people hold in the tenant.
  if (to < service.quantity) assertSeatFloor(await licenceForService(deps.db, service.name), to);
  const legacy = await legacyPrice(deps.db, serviceId, service.recurring.currency);
  if (legacy) {
    // A customer brought over from Odoo keeps their own price per user; price book changes never touch it.
    const recurringPrice = money(divRound(legacy.recurringMinor * BigInt(to), BigInt(legacy.quantity)), legacy.currency);
    const unitPrice = money(divRound(legacy.recurringMinor, BigInt(legacy.quantity)), legacy.currency);
    const preview = await deps.billing.previewUpgrade(serviceId, { quantity: to, recurringPrice }).catch(billingFailure);
    return { serviceId, serviceName: service.name, from: service.quantity, to, unitPrice, preview, product };
  }
  const month = priceDay(todayIn(deps.organisation.timeZone, deps.now));
  // Existing customers keep adding users at the book price, even if the product is no longer offered to new ones.
  const unitPrice = await approvedPrice(catalogueDb(deps.db), marketOf(deps), productItem(product.slug), month);
  if (!unitPrice) throw new DomainError("unavailable", "We can't price this change right now. Contact support to change it.");
  const preview = await deps.billing.previewUpgrade(serviceId, { quantity: to, recurringPrice: times(unitPrice, to) }).catch(billingFailure);
  return { serviceId, serviceName: service.name, from: service.quantity, to, unitPrice, preview, product };
}

/** The limits for changing the number of users on a service, or null when it can't be changed here. */
export async function quantityLimits(db: TenantDb, billingProductId: string) {
  const product = await catalogueDb(db).product.findFirst({ where: { billingProductId }, select: { quantityAllowed: true, minQuantity: true, unitLabel: true } });
  if (!product?.quantityAllowed) return null;
  return { min: product.minQuantity, max: MAX_QUANTITY, unitLabel: product.unitLabel };
}

/** What a change would cost now and each month, before the customer confirms. */
export async function previewQuantityChange(deps: OrderDeps, serviceId: string, quantity: string | number): Promise<QuantityChange> {
  assertCan(deps.actor, "order");
  const { product: _product, ...change } = await quantityChange(deps, serviceId, quantity);
  return change;
}

/** Applies a change. An increase is charged for the rest of the period now; a decrease applies from the next invoice. */
export async function changeQuantity(deps: OrderDeps, serviceId: string, quantity: string | number) {
  assertCan(deps.actor, "order");
  const change = await quantityChange(deps, serviceId, quantity);
  const done = await deps.billing.upgradeService(serviceId, { quantity: change.to, recurringPrice: change.preview.newRecurring }, PAYMENT_METHODS.eft).catch(billingFailure);
  const now = deps.now ?? new Date();
  let taskId: string | null = null;
  const changed = await deps.db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        reference: newReference(),
        organisationId: deps.organisation.id,
        productId: change.product.id,
        quantity: change.to,
        options: { "Changed from": String(change.from) },
        unitPriceMinor: change.unitPrice.amountMinor,
        currency: change.unitPrice.currency,
        monthlyTotalMinor: change.preview.newRecurring.amountMinor,
        expectedBy: now,
        placedById: deps.actor.userId,
        billingOrderId: done.orderId,
        billingServiceIds: [serviceId],
        billingInvoiceId: done.invoiceId ?? null,
        changesServiceId: serviceId,
      },
    });
    const result = await connectorFor(change.product.category.family.connector).request(
      tx,
      {
        organisationId: deps.organisation.id,
        organisationName: deps.organisation.name,
        orderId: order.id,
        orderReference: order.reference,
        work: "change_quantity",
        productName: change.serviceName,
        quantity: change.to,
        previousQuantity: change.from,
        options: {},
        billingIds: [serviceId],
        setupHours: Math.min(change.product.setupHours, 4),
      },
      now,
    );
    taskId = result.taskId ?? null;
    const updated = await tx.order.update({ where: { id: order.id }, data: { expectedBy: result.expectedBy } });
    // The tenant's licence count follows what the customer pays for; the nightly check flags any gap with the vendor.
    await tx.tenantLicence.updateMany({ where: { name: change.serviceName }, data: { purchased: change.to } });
    await audit(
      tx,
      customerAudit(deps.actor, deps.organisation.id, {
        action: "service.quantity_changed",
        summary: `Changed ${change.serviceName} from ${change.from} to ${change.to}`,
        targetType: "Service",
        targetId: serviceId,
        data: { orderId: order.id, from: change.from, to: change.to },
      }),
    );
    return { order: updated, invoiceId: done.invoiceId };
  });
  // With Microsoft 365 or Google Workspace automation on (U6), the partner gets the new count now and the task closes.
  const pushed = await pushQuantity(prisma, { organisationId: deps.organisation.id, serviceName: change.serviceName, quantity: change.to, taskId });
  return { ...changed, automatic: pushed === "done" };
}

// ─── Domains ─────────────────────────────────────────────────────────

export interface DomainResult extends DomainAvailability {
  /** A year's registration, from the market's price book. */
  price: Money | null;
}

/** How many endings a bare name is checked against: the market's own first. */
const SUGGESTIONS = 5;

/**
 * "kgalehill" checks the market's endings on sale; "kgalehill.com" checks
 * that name (and suggests the rest). Prices come from the account's
 * market's price book, so an ending without an approved price there isn't
 * on sale.
 */
export async function searchDomains(
  db: TenantDb,
  billing: ScopedBilling,
  market: { code: string; currency: string; highlightedTlds: string[] },
  query: string,
  month: string,
): Promise<DomainResult[]> {
  // Loaded when used: the registrars read sealed credentials, which scripts such as the seed never need.
  const { domainCheck } = await import("@/server/domains/active");
  return findDomains(catalogueDb(db), domainCheck(catalogueDb(db), (name) => billing.checkDomain(name)), market, query, month);
}

/** The search itself, for the console (a customer's billing) and the public site (the shared adapter). */
export async function findDomains(
  catalogue: PrismaClient,
  check: (name: string) => Promise<DomainAvailability>,
  market: { code: string; currency: string; highlightedTlds: string[] },
  query: string,
  month: string,
): Promise<DomainResult[]> {
  const q = query.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!q) return [];
  const offers = await tldOffers(catalogue, market, month);
  const byLength = [...offers].sort((a, b) => b.tld.length - a.tld.length);
  const ending = byLength.find((o) => q.endsWith(o.tld));
  const label = ending ? q.slice(0, -ending.tld.length) : q.includes(".") ? q.slice(0, q.indexOf(".")) : q;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) throw new DomainError("invalid", "Use letters, numbers and hyphens only, like kgalehill or kgalehill.com.", "domain");
  const names = [...new Set([q.includes(".") ? q : null, ...offers.slice(0, SUGGESTIONS).map((o) => label + o.tld)].filter((n): n is string => Boolean(n)))];
  const results: DomainResult[] = [];
  for (const name of names) {
    const found = await check(name).catch((e) => {
      if (e instanceof BillingError && e.code === "invalid") return { name, supported: false, available: false };
      throw e;
    });
    const offer = byLength.find((o) => found.name.endsWith(o.tld));
    results.push({ ...found, supported: found.supported && Boolean(offer), price: offer?.register ?? null });
  }
  return results;
}

export async function registerDomain(deps: OrderDeps, rawName: string, rawYears: string | number, startNow?: boolean) {
  assertCan(deps.actor, "order");
  const years = Number(rawYears);
  if (!Number.isInteger(years) || years < 1 || years > 5) throw new DomainError("invalid", "Choose between 1 and 5 years.", "years");
  const market = await catalogueDb(deps.db).market.findUniqueOrThrow({ where: { code: deps.organisation.billingMarket } });
  const month = priceDay(todayIn(deps.organisation.timeZone, deps.now));
  const [result] = (await searchDomains(deps.db, deps.billing, market, rawName, month)).filter((r) => r.name === rawName.trim().toLowerCase());
  if (!result || !result.supported || !result.price) throw new DomainError("invalid", "We don't sell that ending yet.", "domain");
  if (!result.available) throw new DomainError("conflict", `${result.name} is taken. Try another name or ending.`, "domain");
  const product = await productBySlug(catalogueDb(deps.db), DOMAIN_PRODUCT_SLUG);
  if (!product) throw new DomainError("unavailable", "Domains can't be ordered right now.");
  await assertStartNow(deps, startNow);
  const price = money(result.price.amountMinor * BigInt(years), result.price.currency);

  const { activeRegistrar } = await import("@/server/domains/active");
  const registrar = await activeRegistrar(catalogueDb(deps.db), result.name);
  const placed = await deps.billing.registerDomain({ name: result.name, years, price, paymentMethod: PAYMENT_METHODS.eft }).catch(billingFailure);
  const now = deps.now ?? new Date();
  const email = await placerEmail(deps.db, deps.actor.userId);
  const options = { Domain: result.name, Years: String(years) };
  return deps.db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        reference: newReference(),
        organisationId: deps.organisation.id,
        productId: product.id,
        quantity: 1,
        options,
        unitPriceMinor: price.amountMinor,
        currency: price.currency,
        // Domains renew yearly, not monthly.
        monthlyTotalMinor: 0n,
        expectedBy: now,
        placedById: deps.actor.userId,
        billingOrderId: placed.orderId,
        billingServiceIds: placed.domainIds,
        billingInvoiceId: placed.invoiceId ?? null,
      },
    });
    // With a registrar switched on for this ending, it is registered as soon as the invoice is paid (src/server/domains/operations.ts); otherwise staff do it.
    const connected = registrar
      ? await tx.domainOperation
          .create({
            data: {
              organisationId: deps.organisation.id,
              orderId: order.id,
              kind: "REGISTER",
              domain: result.name,
              years,
              registrar: registrar.key,
              billingOrderId: placed.orderId,
              billingInvoiceId: placed.invoiceId ?? null,
              billingDomainId: placed.domainIds[0] ?? null,
            },
          })
          .then(() => ({ expectedBy: new Date(now.getTime() + AUTOMATIC_DOMAIN_HOURS * 3_600_000) }))
      : await connectorFor("WEB_AND_DOMAINS").request(
          tx,
          {
            organisationId: deps.organisation.id,
            organisationName: deps.organisation.name,
            orderId: order.id,
            orderReference: order.reference,
            work: "provision",
            productName: product.name,
            quantity: 1,
            options,
            billingIds: placed.domainIds,
            setupHours: product.setupHours,
          },
          now,
        );
    const updated = await tx.order.update({ where: { id: order.id }, data: { expectedBy: connected.expectedBy } });
    await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "domain.ordered", summary: `Ordered ${result.name} for ${years} ${years === 1 ? "year" : "years"} (${order.reference})`, targetType: "Order", targetId: order.id, data: { startNow: Boolean(startNow) } }));
    await queueEmail(tx, { organisationId: deps.organisation.id, to: email, kind: "order.received", payload: { orderId: order.id } });
    return updated;
  });
}

/** Invoices raised by an order (new services, changes, domains): never compared as monthly invoices. */
export async function orderInvoiceIds(db: TenantDb): Promise<Set<string>> {
  const rows = await db.order.findMany({ where: { billingInvoiceId: { not: null } }, select: { billingInvoiceId: true } });
  return new Set(rows.map((r) => r.billingInvoiceId!));
}
