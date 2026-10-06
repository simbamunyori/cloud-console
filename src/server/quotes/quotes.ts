import type { Market, Prisma, PrismaClient, Quote, QuoteLine, QuoteLineKind } from "@prisma/client";
import { PRICE_PERIOD_DAYS } from "@/lib/domain/pricing";
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { parseDateOnly, todayIn } from "@/lib/dates";
import { money, MoneyParseError, parseMoney, type Money } from "@/lib/domain/money";
import { hashToken } from "@/server/auth/tokens";
import { PAYMENT_METHODS } from "@/server/billing/adapter";
import { connectorFor } from "@/server/connectors/registry";
import type { TenantDb } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { assertStartNow, billingFailure, newReference, type OrderDeps } from "@/server/orders/orders";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";

/**
 * Quotes. Anyone can ask for one, signed in or not, with a short form.
 * Staff price it in the Quotes queue (monthly and one-off lines, and how
 * long it holds) and email it. Accepting needs an account and places an
 * ordinary order at the quoted price; a quote past its date can't be
 * accepted.
 */

export type QuoteWithLines = Quote & { lines: QuoteLine[] };

/** What people see, worked out from the status and the date. */
export type QuoteState = "new" | "sent" | "expired" | "accepted" | "declined" | "closed";

export const QUOTE_STATE_LABEL: Record<QuoteState, string> = {
  new: "New",
  sent: "Sent",
  expired: "Expired",
  accepted: "Accepted",
  declined: "Declined",
  closed: "Closed",
};

export const LINE_KIND_LABEL: Record<QuoteLineKind, string> = { MONTHLY: "A month", ONE_OFF: "Once" };

/** Longest a quote may hold, and the default: as long as prices hold (PRICE_PERIOD_DAYS). */
export const MAX_VALID_DAYS = 90;
export const DEFAULT_VALID_DAYS = PRICE_PERIOD_DAYS;

export function quoteState(q: Pick<Quote, "status" | "validUntil">, today: Date): QuoteState {
  if (q.status === "SENT") return q.validUntil && q.validUntil < today ? "expired" : "sent";
  return q.status.toLowerCase() as QuoteState;
}

/** The market's today, where validity dates are read. */
export const todayForMarket = (market: Pick<Market, "timeZone">, now?: Date) => todayIn(market.timeZone, now);

export function quoteTotals(q: { lines: Pick<QuoteLine, "kind" | "quantity" | "unitPriceMinor">[] }, currency: string) {
  let monthly = 0n;
  let oneOff = 0n;
  for (const l of q.lines) {
    const amount = l.unitPriceMinor * BigInt(l.quantity);
    if (l.kind === "MONTHLY") monthly += amount;
    else oneOff += amount;
  }
  return { monthly: money(monthly, currency), oneOff: money(oneOff, currency) };
}

/** Quoted prices are before tax, which the invoice adds. */
export function quoteTaxNote(m: Pick<Market, "taxEnabled" | "taxLabel" | "currency">) {
  return m.taxEnabled ? `Prices are in ${m.currency}, before ${m.taxLabel}, which is added on the invoice.` : `Prices are in ${m.currency}.`;
}

const lineAmount = (l: Pick<QuoteLine, "quantity" | "unitPriceMinor">, currency: string): Money => money(l.unitPriceMinor * BigInt(l.quantity), currency);

function invalid(error: z.ZodError): never {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
}

const blank = (v?: string) => (v ? v : null);

async function marketRow(db: Pick<PrismaClient, "market">, code: string) {
  const m = await db.market.findUnique({ where: { code } });
  if (!m) throw new DomainError("invalid", "Choose a market.", "market");
  return m;
}

// ─── Asking for a quote ──────────────────────────────────────────────

const requestSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep it under 80 characters."),
  company: z.string().trim().max(120, "Keep it under 120 characters.").optional(),
  email: z.email("Enter an email address like name@company.com.").trim().toLowerCase().max(160),
  phone: z.string().trim().min(1, "Enter a phone number we can call.").max(40, "Keep it under 40 characters."),
  country: z.string().trim().toUpperCase().refine(isCountryCode, "Choose your country."),
  need: z.string().trim().min(10, "Tell us a little more about what you need.").max(2000, "Keep it under 2,000 characters."),
});

export type QuoteRequestInput = z.input<typeof requestSchema> & { product?: string; referral?: string };

/**
 * Work we pass to a partner instead of doing ourselves, asked for through
 * the same quote form (final build, Milestone 9). The key is what the
 * form sends; the visitor is told before sending that the partner will
 * get their request and contact them.
 */
export const REFERRALS = {
  "compliance-project": {
    partner: "NSMC",
    topic: "On-site compliance project",
    heading: "Enterprise compliance projects, on site",
    intro: "Audits, policies and controls carried out at your premises are done by NSMC, our partner for enterprise IT. Tell us what you need and we'll introduce you.",
    notice: "We'll pass your request and contact details to NSMC, who will contact you about it.",
  },
} as const;
export type ReferralKey = keyof typeof REFERRALS;
export const referralOf = (key?: string | null) => (key && key in REFERRALS ? REFERRALS[key as ReferralKey] : null);

/**
 * A new request. From the public site there is no account; from the
 * console it belongs to the member's organisation straight away.
 */
export async function requestQuote(
  db: PrismaClient,
  input: QuoteRequestInput,
  where: { market: string; organisationId?: string; userId?: string },
) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error);
  const v = parsed.data;
  const market = await marketRow(db, where.market);
  // Only a product people can see is kept; anything else is just words in the request.
  const product = input.product
    ? await db.product.findFirst({ where: { slug: input.product, status: "LIVE", category: { family: { status: "LIVE" } } }, select: { id: true, name: true } })
    : null;
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: {
        reference: newReference("QUO"),
        name: v.name,
        company: blank(v.company),
        email: v.email,
        phone: v.phone,
        country: v.country,
        need: v.need,
        market: market.code,
        productId: product?.id ?? null,
        referTo: referralOf(input.referral)?.partner ?? null,
        organisationId: where.organisationId ?? null,
        requestedById: where.userId ?? null,
      },
    });
    await queueEmail(tx, { organisationId: quote.organisationId, to: quote.email, kind: "quote.requested", payload: { quoteId: quote.id } });
    await queueEmail(tx, { to: market.supportEmail, kind: "quote.new_request", payload: { quoteId: quote.id } });
    if (quote.organisationId && where.userId) {
      await audit(
        tx,
        customerAudit({ userId: where.userId, name: v.name }, quote.organisationId, {
          action: "quote.requested",
          summary: `Asked for a quote${product ? ` for ${product.name}` : ""} (${quote.reference})`,
          targetType: "Quote",
          targetId: quote.id,
        }),
      );
    }
    return quote;
  });
}

// ─── Staff ───────────────────────────────────────────────────────────

export interface StaffQuoteDeps {
  db: PrismaClient;
  staff: StaffActor;
  now?: Date;
}

async function staffAuditQuote(tx: Prisma.TransactionClient, staff: StaffActor, quote: Pick<Quote, "id" | "reference" | "organisationId">, action: string, summary: string, data: Record<string, unknown> = {}) {
  await tx.staffAuditEvent.create({
    data: { actorUserId: staff.userId, actorLabel: staffLabel(staff), action, summary, data: { quote: quote.reference, ...data } as Prisma.InputJsonValue },
  });
  if (quote.organisationId) await audit(tx, staffAudit(staff, quote.organisationId, { action, summary, targetType: "Quote", targetId: quote.id }));
}

/** The queue: new requests first, then sent, then the rest, newest first in each. */
export async function quoteQueue(db: PrismaClient, staff: StaffActor) {
  assertStaffCan(staff, "manageQuotes");
  return db.quote.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { lines: true, product: { select: { name: true } }, organisation: { select: { id: true, name: true } } },
    take: 500,
  });
}

export async function quoteForStaff(db: PrismaClient, staff: StaffActor, reference: string) {
  assertStaffCan(staff, "manageQuotes");
  return db.quote.findUnique({
    where: { reference },
    include: { lines: { orderBy: { sortOrder: "asc" } }, product: { include: { category: { include: { family: true } } } }, organisation: { select: { id: true, name: true, currency: true } } },
  });
}

/** Products a quote can be placed as: anything not a draft that billing knows. */
export async function quotableProducts(db: PrismaClient) {
  return db.product.findMany({
    where: { status: { not: "DRAFT" }, billingProductId: { not: null }, slug: { not: "domain-name" } },
    orderBy: [{ category: { family: { sortOrder: "asc" } } }, { category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, fulfilment: true, category: { select: { name: true } } },
  });
}

export interface QuoteLineInput {
  kind: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface QuoteDraftInput {
  market: string;
  productId: string;
  message: string;
  validUntil: string;
  lines: QuoteLineInput[];
}

/**
 * Saves the price lines, the product, the note and the date. Changing a
 * sent quote takes it back to New and stops its link working, so the
 * customer only ever accepts what was last emailed.
 */
export async function saveQuote(deps: StaffQuoteDeps, reference: string, input: QuoteDraftInput) {
  assertStaffCan(deps.staff, "manageQuotes");
  const quote = await deps.db.quote.findUnique({ where: { reference }, include: { lines: true } });
  if (!quote) throw new DomainError("not-found", "No such quote.");
  if (quote.status !== "NEW" && quote.status !== "SENT") throw new DomainError("conflict", "This quote is finished and can't be changed.");
  const market = await marketRow(deps.db, input.market);
  const fieldErrors: Record<string, string> = {};

  let productId: string | null = null;
  if (input.productId) {
    const product = await deps.db.product.findFirst({ where: { id: input.productId, status: { not: "DRAFT" }, billingProductId: { not: null } } });
    if (!product) fieldErrors.productId = "Choose a product that isn't a draft.";
    else productId = product.id;
  }

  let validUntil: Date | null = null;
  if (input.validUntil.trim()) {
    validUntil = parseDateOnly(input.validUntil.trim());
    const today = todayForMarket(market, deps.now);
    const latest = new Date(today.getTime() + MAX_VALID_DAYS * 86_400_000);
    if (!validUntil) fieldErrors.validUntil = "Enter a date like 2026-10-31.";
    else if (validUntil < today) fieldErrors.validUntil = "Choose today or a later day.";
    else if (validUntil > latest) fieldErrors.validUntil = `A quote can hold for up to ${MAX_VALID_DAYS} days.`;
  }

  const message = input.message.trim();
  if (message.length > 2000) fieldErrors.message = "Keep it under 2,000 characters.";

  const lines: Prisma.QuoteLineCreateManyQuoteInput[] = [];
  input.lines.forEach((l, i) => {
    const description = l.description.trim();
    if (!description && !l.unitPrice.trim()) return; // an empty row
    const key = (f: string) => `lines.${i}.${f}`;
    if (!description) fieldErrors[key("description")] = "Describe this line.";
    else if (description.length > 200) fieldErrors[key("description")] = "Keep it under 200 characters.";
    const kind = l.kind === "ONE_OFF" ? "ONE_OFF" : l.kind === "MONTHLY" ? "MONTHLY" : null;
    if (!kind) fieldErrors[key("kind")] = "Choose monthly or once.";
    const quantity = Number(l.quantity.trim() || "1");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) fieldErrors[key("quantity")] = "A whole number from 1.";
    let unitPriceMinor = 0n;
    try {
      unitPriceMinor = parseMoney(l.unitPrice, market.currency);
      if (unitPriceMinor < 0n) fieldErrors[key("unitPrice")] = "A price can't be negative.";
    } catch (e) {
      if (!(e instanceof MoneyParseError)) throw e;
      fieldErrors[key("unitPrice")] = `Enter an amount in ${market.currency}, like 1250.00.`;
    }
    lines.push({ kind: kind ?? "MONTHLY", description, quantity: Number.isInteger(quantity) ? quantity : 1, unitPriceMinor, sortOrder: i });
  });
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);

  const wasSent = quote.status === "SENT";
  await deps.db.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
    if (lines.length) await tx.quoteLine.createMany({ data: lines.map((l) => ({ ...l, quoteId: quote.id })) });
    await tx.quote.update({
      where: { id: quote.id },
      data: { market: market.code, productId, message: message || null, validUntil, ...(wasSent ? { status: "NEW", tokenHash: null } : {}) },
    });
    await staffAuditQuote(tx, deps.staff, quote, "quote.saved", `Changed quote ${quote.reference}`, { lines: lines.length, market: market.code });
  });
  return { wasSent };
}

/** Emails the quote. It must have a product, a line and a date it holds until. */
export async function sendQuote(deps: StaffQuoteDeps, reference: string) {
  assertStaffCan(deps.staff, "manageQuotes");
  const quote = await deps.db.quote.findUnique({ where: { reference }, include: { lines: true, organisation: true } });
  if (!quote) throw new DomainError("not-found", "No such quote.");
  if (quote.status !== "NEW" && quote.status !== "SENT") throw new DomainError("conflict", "This quote is finished and can't be sent.");
  const market = await marketRow(deps.db, quote.market);
  const missing: string[] = [];
  if (!quote.productId) missing.push("choose the product it is ordered as");
  if (!quote.lines.length) missing.push("add at least one price line");
  if (!quote.validUntil) missing.push("set the date it holds until");
  else if (quote.validUntil < todayForMarket(market, deps.now)) missing.push("move the date it holds until to today or later");
  if (missing.length) throw new DomainError("invalid", `Before sending, ${missing.join(", ")}.`);
  if (quote.organisation && quote.organisation.currency !== market.currency) {
    throw new DomainError("invalid", `${quote.organisation.name} is billed in ${quote.organisation.currency}, so price it in a market that uses ${quote.organisation.currency}.`);
  }
  const now = deps.now ?? new Date();
  await deps.db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quote.id }, data: { status: "SENT", sentAt: now, sentByName: staffLabel(deps.staff) } });
    await queueEmail(tx, { organisationId: quote.organisationId, to: quote.email, kind: "quote.sent", payload: { quoteId: quote.id } });
    await staffAuditQuote(tx, deps.staff, quote, "quote.sent", `Sent quote ${quote.reference} to ${quote.email}`);
  });
}

/** Closes a request without a sale: a duplicate, spam, or nothing we can do. */
export async function closeQuote(deps: StaffQuoteDeps, reference: string, reason: string) {
  assertStaffCan(deps.staff, "manageQuotes");
  const quote = await deps.db.quote.findUnique({ where: { reference } });
  if (!quote) throw new DomainError("not-found", "No such quote.");
  if (quote.status !== "NEW" && quote.status !== "SENT") throw new DomainError("conflict", "This quote is already finished.");
  const why = reason.trim();
  if (!why) throw new DomainError("invalid", "Say why, for the record.", "reason");
  if (why.length > 500) throw new DomainError("invalid", "Keep it under 500 characters.", "reason");
  await deps.db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quote.id }, data: { status: "CLOSED", tokenHash: null, decidedAt: deps.now ?? new Date(), decidedByName: staffLabel(deps.staff), declineReason: why } });
    await staffAuditQuote(tx, deps.staff, quote, "quote.closed", `Closed quote ${quote.reference}`, { reason: why });
  });
}

/**
 * Records that staff introduced the customer to the partner the request
 * is for, closes it, and tells the customer who will be in touch.
 */
export async function referQuote(deps: StaffQuoteDeps, reference: string) {
  assertStaffCan(deps.staff, "manageQuotes");
  const quote = await deps.db.quote.findUnique({ where: { reference } });
  if (!quote) throw new DomainError("not-found", "No such quote.");
  if (!quote.referTo) throw new DomainError("conflict", "This request isn't for a partner.");
  if (quote.status !== "NEW") throw new DomainError("conflict", "This request is already finished.");
  const now = deps.now ?? new Date();
  await deps.db.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: "CLOSED", tokenHash: null, referredAt: now, decidedAt: now, decidedByName: staffLabel(deps.staff), declineReason: `Introduced to ${quote.referTo}.` },
    });
    await queueEmail(tx, { organisationId: quote.organisationId, to: quote.email, kind: "quote.referred", payload: { quoteId: quote.id } });
    await staffAuditQuote(tx, deps.staff, quote, "quote.referred", `Introduced ${quote.company ?? quote.name} to ${quote.referTo} (${quote.reference})`, { partner: quote.referTo });
  });
}

// ─── Customers ───────────────────────────────────────────────────────

const customerInclude = { lines: { orderBy: { sortOrder: "asc" } }, product: { select: { name: true, minTermMonths: true, commitmentNote: true } } } as const;

/** The quote an emailed link opens, if the link is the newest one. */
export async function quoteByToken(db: PrismaClient, token: string) {
  if (!token) return null;
  const quote = await db.quote.findUnique({ where: { tokenHash: hashToken(token) }, include: { ...customerInclude, organisation: { select: { id: true, name: true } } } });
  if (!quote) return null;
  return { quote, market: await marketRow(db, quote.market) };
}

/** The organisation's own quotes, for the console. */
export async function organisationQuotes(db: TenantDb) {
  return db.quote.findMany({ where: { status: { in: ["SENT", "ACCEPTED", "DECLINED", "NEW"] } }, orderBy: { createdAt: "desc" }, include: customerInclude });
}

export async function organisationQuote(db: TenantDb, reference: string) {
  return db.quote.findFirst({ where: { reference }, include: customerInclude });
}

/**
 * Takes a quote opened from its link into the member's organisation, so it
 * can be accepted there. A quote already in another organisation stays put.
 */
export async function claimQuote(
  db: PrismaClient,
  token: string,
  member: { actor: Actor; organisation: { id: string; name: string; currency: string } },
  now = new Date(),
) {
  assertCan(member.actor, "order");
  const found = await quoteByToken(db, token);
  if (!found) throw new DomainError("not-found", "This link doesn't work any more. Use the newest email about this quote.");
  const { quote, market } = found;
  if (quoteState(quote, todayForMarket(market, now)) !== "sent") throw new DomainError("conflict", "This quote can't be accepted any more.");
  if (quote.organisationId && quote.organisationId !== member.organisation.id) {
    throw new DomainError("conflict", "This quote belongs to another account. Switch to it to accept.");
  }
  if (market.currency !== member.organisation.currency) {
    throw new DomainError("invalid", `This quote is in ${market.currency}, and ${member.organisation.name} is billed in ${member.organisation.currency}. Reply to the email and we'll send one in ${member.organisation.currency}.`);
  }
  if (!quote.organisationId) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.quote.updateMany({ where: { id: quote.id, organisationId: null }, data: { organisationId: member.organisation.id } });
      if (claimed.count !== 1) throw new DomainError("conflict", "This quote was just taken into another account.");
      await audit(tx, customerAudit(member.actor, member.organisation.id, { action: "quote.added", summary: `Added quote ${quote.reference} to the account`, targetType: "Quote", targetId: quote.id }));
    });
  }
  return quote.reference;
}

async function openQuote(deps: Pick<OrderDeps, "db" | "now">, reference: string) {
  const quote = await deps.db.quote.findFirst({ where: { reference }, include: { lines: true, product: { include: { category: { include: { family: true } } } } } });
  if (!quote) throw new DomainError("not-found", "No such quote.");
  const market = await (deps.db as unknown as PrismaClient).market.findUniqueOrThrow({ where: { code: quote.market } });
  const state = quoteState(quote, todayForMarket(market, deps.now));
  if (state === "expired") throw new DomainError("conflict", "This quote has expired. Ask us for a new one.");
  if (state !== "sent") throw new DomainError("conflict", "This quote can't be accepted any more.");
  return { quote, market };
}

/**
 * Accepts a sent quote: an ordinary order at the quoted price. The monthly
 * lines become the service's monthly price and the one-off lines join its
 * first invoice.
 */
export async function acceptQuote(deps: OrderDeps, reference: string, startNow?: boolean) {
  assertCan(deps.actor, "order");
  const { quote, market } = await openQuote(deps, reference);
  if (market.currency !== deps.organisation.currency) {
    throw new DomainError("invalid", `This quote is in ${market.currency}, and your account is billed in ${deps.organisation.currency}. Ask us to send it again in ${deps.organisation.currency}.`);
  }
  const product = quote.product;
  if (!product?.billingProductId || product.status === "DRAFT") throw new DomainError("unavailable", "This quote can't be ordered yet. Contact support and we'll set it up for you.");
  await assertStartNow(deps, startNow);
  const { monthly, oneOff } = quoteTotals(quote, market.currency);

  // Taken first, so a second click can't order twice; given back if billing says no.
  const taken = await deps.db.quote.updateMany({ where: { id: quote.id, status: "SENT" }, data: { status: "ACCEPTED" } });
  if (taken.count !== 1) throw new DomainError("conflict", "This quote was just accepted or changed. Reload the page.");
  const placed = await deps.billing
    .placeOrder({
      paymentMethod: PAYMENT_METHODS.eft,
      createInvoice: true,
      items: [{ productId: product.billingProductId, quantity: 1, billingCycle: "monthly", recurringPrice: monthly, options: { Quote: quote.reference } }],
      oneOffLines: quote.lines.filter((l) => l.kind === "ONE_OFF").map((l) => ({ description: l.quantity > 1 ? `${l.description} (${l.quantity})` : l.description, amount: lineAmount(l, market.currency) })),
    })
    .catch(async (e) => {
      await deps.db.quote.updateMany({ where: { id: quote.id, status: "ACCEPTED", orderId: null }, data: { status: "SENT" } });
      billingFailure(e);
    });

  const now = deps.now ?? new Date();
  const options = { Quote: quote.reference };
  const email = (await (deps.db as unknown as PrismaClient).user.findUniqueOrThrow({ where: { id: deps.actor.userId }, select: { email: true } })).email;
  return deps.db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        reference: newReference(),
        organisationId: deps.organisation.id,
        productId: product.id,
        quantity: 1,
        options,
        unitPriceMinor: monthly.amountMinor,
        currency: monthly.currency,
        monthlyTotalMinor: monthly.amountMinor,
        expectedBy: now,
        placedById: deps.actor.userId,
        billingOrderId: placed.orderId,
        billingServiceIds: placed.serviceIds,
        billingInvoiceId: placed.invoiceId ?? null,
      },
    });
    const scope = quote.lines.map((l) => `${l.description}${l.quantity > 1 ? ` x${l.quantity}` : ""} (${LINE_KIND_LABEL[l.kind].toLowerCase()})`).join("; ");
    const result = await connectorFor(product.category.family.connector).request(
      tx,
      {
        organisationId: deps.organisation.id,
        organisationName: deps.organisation.name,
        orderId: order.id,
        orderReference: order.reference,
        work: "provision",
        productName: product.name,
        quantity: 1,
        options: { ...options, "What was quoted": scope },
        billingIds: placed.serviceIds,
        setupHours: product.setupHours,
      },
      now,
    );
    const updated = await tx.order.update({ where: { id: order.id }, data: { expectedBy: result.expectedBy } });
    await tx.quote.update({ where: { id: quote.id }, data: { orderId: order.id, decidedAt: now, decidedByName: deps.actor.name, tokenHash: null } });
    await audit(
      tx,
      customerAudit(deps.actor, deps.organisation.id, {
        action: "quote.accepted",
        summary: `Accepted quote ${quote.reference} and ordered ${product.name} (${order.reference})`,
        targetType: "Order",
        targetId: order.id,
        data: { startNow: Boolean(startNow), quote: quote.reference, oneOffMinor: oneOff.amountMinor.toString() },
      }),
    );
    await queueEmail(tx, { organisationId: deps.organisation.id, to: email, kind: "order.received", payload: { orderId: order.id } });
    return updated;
  });
}

const declineSchema = z.string().trim().max(500, "Keep it under 500 characters.");

/** Declined in the console. */
export async function declineQuote(deps: Pick<OrderDeps, "db" | "actor" | "organisation" | "now">, reference: string, reason: string) {
  assertCan(deps.actor, "order");
  const why = declineSchema.safeParse(reason);
  if (!why.success) throw new DomainError("invalid", why.error.issues[0].message, "reason");
  const { quote } = await openQuote(deps, reference);
  await deps.db.$transaction(async (tx) => {
    const done = await tx.quote.updateMany({ where: { id: quote.id, status: "SENT" }, data: { status: "DECLINED", tokenHash: null, decidedAt: deps.now ?? new Date(), decidedByName: deps.actor.name, declineReason: why.data || null } });
    if (done.count !== 1) throw new DomainError("conflict", "This quote was just changed. Reload the page.");
    await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "quote.declined", summary: `Declined quote ${quote.reference}`, targetType: "Quote", targetId: quote.id }));
  });
}

/** Declined from the emailed link, without an account. */
export async function declineQuoteByToken(db: PrismaClient, token: string, reason: string, now = new Date()) {
  const why = declineSchema.safeParse(reason);
  if (!why.success) throw new DomainError("invalid", why.error.issues[0].message, "reason");
  const found = await quoteByToken(db, token);
  if (!found) throw new DomainError("not-found", "This link doesn't work any more. Use the newest email about this quote.");
  if (quoteState(found.quote, todayForMarket(found.market, now)) !== "sent") throw new DomainError("conflict", "This quote can't be changed any more.");
  const done = await db.quote.updateMany({ where: { id: found.quote.id, status: "SENT" }, data: { status: "DECLINED", tokenHash: null, decidedAt: now, decidedByName: found.quote.name, declineReason: why.data || null } });
  if (done.count !== 1) throw new DomainError("conflict", "This quote was just changed. Reload the page.");
}

