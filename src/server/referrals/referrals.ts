import { randomBytes } from "node:crypto";
import type { PrismaClient, ReferralPartnerKind, ReferralPartnerStatus } from "@prisma/client";
import { divRound } from "@/lib/domain/money";
import type { BillingAdapter } from "@/server/billing/adapter";
import { queueEmail } from "@/server/email/outbox";
import { featureOn } from "@/server/features/features";
import { DomainError } from "@/server/org/access";
import { openValue, sealValue } from "@/server/partners/vault";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { monthRange } from "@/server/units/units";

/**
 * Referral partners (docs/STRATEGY_ROLLOUT.md, U9): accountants,
 * consultants and IT resellers apply on the site, Admins approve them and
 * set their commission, their link brings customers, and each month they
 * get a statement of what their customers paid us and their share. Finance
 * records each payout. Behind "Referral partners" in Features.
 */

export const KIND_LABEL: Record<ReferralPartnerKind, string> = { ACCOUNTANT: "Accountant", CONSULTANT: "Consultant", IT_RESELLER: "IT reseller", OTHER: "Something else" };
export const STATUS_LABEL: Record<ReferralPartnerStatus, string> = { APPLIED: "Applied", ACTIVE: "Active", PAUSED: "Paused", DECLINED: "Declined" };
export const REFERRAL_CONSENT = "I agree that Fourth Generation Technologies may keep these details to run the referral partner programme and email me about it, as set out in the Privacy Notice.";
export const REFERRAL_COOKIE = "console_referral";
/** How long a click on a partner's link keeps counting. */
export const REFERRAL_DAYS = 90;
const FEATURE = "referral-partners";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const referralsOn = (db: Pick<PrismaClient, "featureSwitch">) => featureOn(db, FEATURE);

export async function referralSettings(db: Pick<PrismaClient, "referralSettings">) {
  return { commissionBps: (await db.referralSettings.findUnique({ where: { id: "referrals" } }))?.commissionBps ?? 1000 };
}

/** "12.5" to 1250 basis points; null when blank. */
function parsePercent(raw: string): number | null | "bad" {
  const v = raw.trim().replace(/%$/, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 50 || Math.round(n * 100) !== n * 100) return "bad";
  return Math.round(n * 100);
}

export const percentOf = (bps: number) => `${bps / 100}%`;

export interface ApplicationInput {
  name: string;
  company: string;
  email: string;
  phone: string;
  kind: string;
  market: string;
  consent: boolean;
}

/** An application from the site. Admins are told; the applicant gets a note that it arrived. */
export async function applyAsPartner(db: PrismaClient, input: ApplicationInput, now = new Date()) {
  if (!(await referralsOn(db))) throw new DomainError("not-found", "The referral programme isn't open yet.");
  const fieldErrors: Record<string, string> = {};
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || input.name.length > 120) fieldErrors.name = "Enter your name.";
  if (!input.company.trim() || input.company.length > 160) fieldErrors.company = "Enter your firm's name.";
  if (!EMAIL.test(email)) fieldErrors.email = "Enter an email address like name@firm.co.bw.";
  if (input.phone.length > 40) fieldErrors.phone = "That's too long.";
  if (!(input.kind in KIND_LABEL)) fieldErrors.kind = "Choose what your firm does.";
  if (!input.consent) fieldErrors.consent = "Tick the box so we can keep your details.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const open = await db.referralPartner.findFirst({ where: { email, status: { in: ["APPLIED", "ACTIVE", "PAUSED"] } } });
  if (open) throw new DomainError("conflict", open.status === "APPLIED" ? "We already have your application. We'll be in touch." : "You're already a referral partner. Your dashboard link is in your welcome email.");
  const admins = await db.user.findMany({ where: { kind: "STAFF", staffRole: "ADMIN", deactivatedAt: null }, select: { email: true } });
  return db.$transaction(async (tx) => {
    const p = await tx.referralPartner.create({
      data: { name: input.name.trim(), company: input.company.trim(), email, phone: input.phone.trim() || null, kind: input.kind as ReferralPartnerKind, market: input.market, consentText: REFERRAL_CONSENT, consentAt: now },
    });
    await queueEmail(tx, { to: email, kind: "referral.received", payload: { partnerId: p.id } });
    for (const a of admins) await queueEmail(tx, { to: a.email, kind: "referral.applied", payload: { partnerId: p.id } });
    return p;
  });
}

function staffAudit(db: Pick<PrismaClient, "staffAuditEvent">, staff: StaffActor, action: string, summary: string, data: Record<string, unknown>) {
  return db.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action, summary, data: data as object } });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "partner";

async function freeCode(db: Pick<PrismaClient, "referralPartner">, base: string) {
  for (let i = 0; i < 20; i++) {
    const code = i ? `${base}-${i + 1}` : base;
    if (!(await db.referralPartner.findUnique({ where: { code } }))) return code;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Admins approve (with an optional commission of their own) or decline an application. */
export async function decideApplication(deps: { db: PrismaClient; staff: StaffActor }, id: string, input: { decision: string; commission: string }, now = new Date()) {
  assertStaffCan(deps.staff, "managePartners");
  const p = await deps.db.referralPartner.findUnique({ where: { id } });
  if (!p) throw new DomainError("not-found", "No such application.");
  if (p.status !== "APPLIED") throw new DomainError("conflict", "That application has been decided.");
  if (input.decision === "decline") {
    await deps.db.$transaction(async (tx) => {
      await tx.referralPartner.update({ where: { id }, data: { status: "DECLINED", decidedAt: now, decidedById: deps.staff.userId } });
      await staffAudit(tx, deps.staff, "referral.declined", `Declined ${p.company} as a referral partner`, { id });
      await queueEmail(tx, { to: p.email, kind: "referral.declined", payload: { partnerId: id } });
    });
    return;
  }
  const bps = parsePercent(input.commission);
  if (bps === "bad") throw new DomainError("invalid", "Enter a percentage from 0 to 50, or leave it blank for the default.", "commission");
  const code = await freeCode(deps.db, slug(p.company));
  await deps.db.$transaction(async (tx) => {
    await tx.referralPartner.update({ where: { id }, data: { status: "ACTIVE", code, dashboardToken: randomBytes(24).toString("base64url"), commissionBps: bps, decidedAt: now, decidedById: deps.staff.userId } });
    await staffAudit(tx, deps.staff, "referral.approved", `Approved ${p.company} as a referral partner (${code})`, { id, code, commissionBps: bps });
    await queueEmail(tx, { to: p.email, kind: "referral.approved", payload: { partnerId: id } });
  });
}

/** Pause or resume a partner, or change their own commission (blank: the default). */
export async function updatePartner(deps: { db: PrismaClient; staff: StaffActor }, id: string, input: { status: string; commission: string }) {
  assertStaffCan(deps.staff, "managePartners");
  const p = await deps.db.referralPartner.findUnique({ where: { id } });
  if (!p || !["ACTIVE", "PAUSED"].includes(p.status)) throw new DomainError("not-found", "No such partner.");
  const bps = parsePercent(input.commission);
  if (bps === "bad") throw new DomainError("invalid", "Enter a percentage from 0 to 50, or leave it blank for the default.", "commission");
  const status = input.status === "PAUSED" ? "PAUSED" : "ACTIVE";
  await deps.db.$transaction(async (tx) => {
    await tx.referralPartner.update({ where: { id }, data: { status, commissionBps: bps } });
    await staffAudit(tx, deps.staff, "referral.changed", `${p.company}: ${STATUS_LABEL[status].toLowerCase()}, commission ${bps === null ? "the default" : percentOf(bps)}`, { id, status, commissionBps: bps });
  });
}

export async function saveReferralSettings(deps: { db: PrismaClient; staff: StaffActor }, input: { commission: string }) {
  assertStaffCan(deps.staff, "managePartners");
  const bps = parsePercent(input.commission);
  if (bps === null || bps === "bad") throw new DomainError("invalid", "Enter a percentage from 0 to 50.", "commission");
  await deps.db.$transaction(async (tx) => {
    await tx.referralSettings.upsert({ where: { id: "referrals" }, create: { id: "referrals", commissionBps: bps, updatedById: deps.staff.userId }, update: { commissionBps: bps, updatedById: deps.staff.userId } });
    await staffAudit(tx, deps.staff, "referral.settings", `Set the default referral commission to ${percentOf(bps)}`, { commissionBps: bps });
  });
}

/** The partner a link's code belongs to, while the programme is on and they're active. */
export async function activePartnerByCode(db: PrismaClient, code: string) {
  const clean = code.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,48}$/.test(clean) || !(await referralsOn(db))) return null;
  return db.referralPartner.findFirst({ where: { code: clean, status: "ACTIVE" } });
}

/** At sign-up: a customer who came through an active partner's link counts as theirs. */
export async function attributeSignUp(db: PrismaClient, organisationId: string, code: string | null | undefined) {
  if (!code) return null;
  const partner = await activePartnerByCode(db, code);
  if (!partner) return null;
  return db.referral.upsert({ where: { organisationId }, create: { partnerId: partner.id, organisationId }, update: {} });
}

async function rateMicros(db: Pick<PrismaClient, "fxRate">, day: string, base: string, quote: string) {
  if (base === quote) return 1_000_000n;
  return (await db.fxRate.findFirst({ where: { base, quote, month: { lte: day } }, orderBy: { month: "desc" } }))?.rateMicros ?? null;
}

export interface StatementLine {
  organisation: string;
  paidInMinor: string;
  /** Payments in a currency with no exchange rate, left out. */
  skipped: number;
}

/** On the 3rd: last month's statement for each partner with customers, from what those customers paid us. */
export async function writeStatements(db: PrismaClient, adapter: BillingAdapter, now = new Date()) {
  if (!(await referralsOn(db))) return 0;
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const { from, to } = monthRange(month);
  const day = now.toISOString().slice(0, 10);
  const currency = (await db.market.findUnique({ where: { code: "bw" }, select: { currency: true } }))?.currency ?? "BWP";
  const { commissionBps } = await referralSettings(db);
  const partners = await db.referralPartner.findMany({ where: { status: { in: ["ACTIVE", "PAUSED"] }, referrals: { some: {} } }, include: { referrals: true } });
  let written = 0;
  for (const p of partners) {
    const existing = await db.referralStatement.findUnique({ where: { partnerId_month: { partnerId: p.id, month } } });
    if (existing) continue;
    const orgs = await db.organisation.findMany({ where: { id: { in: p.referrals.map((r) => r.organisationId) } }, select: { name: true, billingAccount: { select: { provider: true, externalClientId: true } } } });
    const lines: StatementLine[] = [];
    let paid = 0n;
    for (const o of orgs) {
      if (!o.billingAccount || o.billingAccount.provider !== adapter.provider) continue;
      const tx = await adapter.listTransactions(o.billingAccount.externalClientId, { from, to: new Date(to.getTime() - 1) });
      let sum = 0n;
      let skipped = 0;
      for (const t of tx) {
        if (t.amountIn.amountMinor <= 0n || t.date < from || t.date >= to) continue;
        const rate = await rateMicros(db, day, t.amountIn.currency, currency);
        if (rate === null) {
          skipped++;
          continue;
        }
        sum += divRound(t.amountIn.amountMinor * rate, 1_000_000n);
      }
      if (sum || skipped) lines.push({ organisation: o.name, paidInMinor: sum.toString(), skipped });
      paid += sum;
    }
    const rate = p.commissionBps ?? commissionBps;
    const commission = divRound(paid * BigInt(rate), 10_000n);
    await db.$transaction(async (tx) => {
      const s = await tx.referralStatement.create({ data: { partnerId: p.id, month, currency, paidInMinor: paid, rateBps: rate, commissionMinor: commission, lines: lines as unknown as object, status: commission > 0n ? "DUE" : "NIL" } });
      await queueEmail(tx, { to: p.email, kind: "referral.statement", payload: { statementId: s.id } });
    });
    written++;
  }
  return written;
}

/** Finance records that a statement was paid, with the bank's reference. The partner is told. */
export async function recordPayout(deps: { db: PrismaClient; staff: StaffActor }, statementId: string, reference: string, now = new Date()) {
  assertStaffCan(deps.staff, "confirmPayments");
  const ref = reference.trim();
  if (!ref || ref.length > 120) throw new DomainError("invalid", "Enter the payment's reference.", "reference");
  const s = await deps.db.referralStatement.findUnique({ where: { id: statementId }, include: { partner: true } });
  if (!s) throw new DomainError("not-found", "No such statement.");
  if (s.status !== "DUE") throw new DomainError("conflict", s.status === "PAID" ? "That statement is already paid." : "Nothing is due on that statement.");
  await deps.db.$transaction(async (tx) => {
    const claimed = await tx.referralStatement.updateMany({ where: { id: s.id, status: "DUE" }, data: { status: "PAID", paidAt: now, paidById: deps.staff.userId, paymentRef: ref } });
    if (!claimed.count) throw new DomainError("conflict", "That statement is already paid.");
    await staffAudit(tx, deps.staff, "referral.paid", `Paid ${s.partner.company}'s ${s.month} commission (${ref})`, { statementId: s.id, reference: ref });
    await queueEmail(tx, { to: s.partner.email, kind: "referral.paid", payload: { statementId: s.id } });
  });
}

/** What a partner sees through their dashboard link. Null when the link doesn't work any more. */
export async function partnerDashboard(db: PrismaClient, token: string) {
  if (!token || !(await referralsOn(db))) return null;
  const p = await db.referralPartner.findUnique({ where: { dashboardToken: token }, include: { referrals: { orderBy: { createdAt: "desc" } }, statements: { orderBy: { month: "desc" }, take: 24 } } });
  if (!p || !["ACTIVE", "PAUSED"].includes(p.status)) return null;
  const orgs = await db.organisation.findMany({ where: { id: { in: p.referrals.map((r) => r.organisationId) } }, select: { id: true, name: true } });
  const { commissionBps } = await referralSettings(db);
  return {
    partner: { id: p.id, name: p.name, company: p.company, code: p.code!, status: p.status, market: p.market, commissionBps: p.commissionBps ?? commissionBps, hasPayoutDetails: Boolean(p.payoutDetails) },
    customers: p.referrals.map((r) => ({ name: orgs.find((o) => o.id === r.organisationId)?.name ?? "A customer", since: r.createdAt })),
    statements: p.statements,
  };
}

/** The partner gives their bank details from their dashboard; they're sealed and only Finance sees them. */
export async function savePayoutDetails(db: PrismaClient, token: string, details: string) {
  const d = await partnerDashboard(db, token);
  if (!d) throw new DomainError("not-found", "That link doesn't work any more.");
  const text = details.trim();
  if (text.length < 10 || text.length > 1000) throw new DomainError("invalid", "Enter the bank, branch, account name and account number.", "details");
  await db.referralPartner.update({ where: { id: d.partner.id }, data: { payoutDetails: sealValue(text) } });
}

export function payoutDetailsFor(sealed: string | null) {
  if (!sealed) return null;
  try {
    return openValue(sealed);
  } catch {
    return null;
  }
}
