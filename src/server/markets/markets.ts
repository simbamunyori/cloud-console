import type { Market, PrismaClient, TaxDisplay } from "@prisma/client";
import { cache } from "react";
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { isSupportedCurrency } from "@/lib/domain/money";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Markets decide currency, prices, catalogue, content and legal pages.
 * Everything else is the same in every market. Four are seeded (bw, za,
 * zw, global); only staff change them, and every change is logged.
 */

export type MarketCode = string;
export type PaymentMethodKind = "card" | "eft";
export const PAYMENT_METHOD_KINDS: PaymentMethodKind[] = ["card", "eft"];

export { CATCH_ALL, defaultMarket, marketForCountry, type MarketRow } from "@/lib/domain/markets";
import { CATCH_ALL } from "@/lib/domain/markets";

export async function listMarkets(db: Pick<PrismaClient, "market">) {
  return db.market.findMany({ orderBy: { sortOrder: "asc" } });
}

/** Markets read once per request. */
export const cachedMarkets = cache(async (db: Pick<PrismaClient, "market">) => listMarkets(db));

export async function getMarket(db: Pick<PrismaClient, "market">, code: string) {
  const m = await db.market.findUnique({ where: { code } });
  if (!m) throw new DomainError("not-found", "No such market.");
  return m;
}

export interface EftDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode?: string;
  swiftCode?: string;
}

/** The market's bank account for EFT, or null if EFT is off or details are missing. */
export function eftDetails(m: Market): EftDetails | null {
  if (!m.paymentMethods.includes("eft") || !m.eftBankName || !m.eftAccountName || !m.eftAccountNumber) return null;
  return { bankName: m.eftBankName, accountName: m.eftAccountName, accountNumber: m.eftAccountNumber, branchCode: m.eftBranchCode ?? undefined, swiftCode: m.eftSwiftCode ?? undefined };
}

// ─── Editing ─────────────────────────────────────────────────────────

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));
const required = (max: number, what: string) => z.string().trim().min(1, `Enter ${what}.`).max(max, `Keep it under ${max} characters.`);
const list = (pattern: RegExp, message: string) =>
  z
    .string()
    .transform((v) =>
      v
        .split(/[\s,]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .refine((xs) => xs.every((x) => pattern.test(x)), message);

export const marketSettingsSchema = z.object({
  name: required(60, "a name"),
  countries: list(/^[A-Za-z]{2}$/, "Use two-letter country codes, like ZA.")
    .transform((xs) => xs.map((x) => x.toUpperCase()))
    .refine((xs) => xs.every(isCountryCode), "One of those isn't a country code."),
  currency: required(3, "a currency")
    .transform((v) => v.toUpperCase())
    .refine(isSupportedCurrency, "We can't format that currency yet."),
  locale: required(20, "a locale").refine((v) => {
    try {
      return Intl.NumberFormat.supportedLocalesOf([v]).length === 1;
    } catch {
      return false;
    }
  }, "That isn't a locale we recognise, e.g. en-ZA."),
  timeZone: required(60, "a time zone").refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "That isn't a time zone we recognise, e.g. Africa/Johannesburg."),
  taxEnabled: z.boolean(),
  taxRatePercent: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter a rate like 14 or 15.5.")
    .transform((v) => Math.round(Number(v) * 100)),
  taxDisplay: z.enum(["INCLUSIVE", "EXCLUSIVE"]),
  taxLabel: required(20, "a tax label"),
  taxRegistrationNumber: text(40),
  companyRegistrationNumber: text(40),
  registeredAddress: text(200),
  ownDataCentre: z.boolean(),
  paymentMethods: z.array(z.enum(["card", "eft"])).min(1, "Choose at least one way to pay."),
  eftBankName: text(80),
  eftAccountName: text(120),
  eftAccountNumber: text(40),
  eftBranchCode: text(20),
  eftSwiftCode: text(20),
  supportEmail: required(120, "a support email").pipe(z.email("Enter an email address.")),
  supportPhone: text(40),
  supportHours: required(120, "support hours"),
  highlightedTlds: list(/^\.[a-z0-9.-]{2,30}$/i, "Write domain endings with a dot, like .co.za.").transform((xs) => xs.map((x) => x.toLowerCase())),
  dataProtectionLaw: text(120),
});

export type MarketSettingsInput = z.input<typeof marketSettingsSchema>;

interface MarketDeps {
  db: PrismaClient;
  staff: StaffActor;
}

const FIELDS = [
  "name",
  "countries",
  "currency",
  "locale",
  "timeZone",
  "taxEnabled",
  "taxRateBps",
  "taxDisplay",
  "taxLabel",
  "taxRegistrationNumber",
  "companyRegistrationNumber",
  "registeredAddress",
  "ownDataCentre",
  "paymentMethods",
  "eftBankName",
  "eftAccountName",
  "eftAccountNumber",
  "eftBranchCode",
  "eftSwiftCode",
  "supportEmail",
  "supportPhone",
  "supportHours",
  "highlightedTlds",
  "dataProtectionLaw",
] as const;

const show = (v: unknown): string | null => (v === null || v === undefined ? null : Array.isArray(v) ? v.join(", ") : String(v));

/** Saves a market's settings, logging each field that changed. Returns the fields that changed. */
export async function updateMarketSettings(deps: MarketDeps, code: string, input: MarketSettingsInput) {
  assertStaffCan(deps.staff, "manageMarkets");
  const parsed = marketSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  }
  const { taxRatePercent, ...rest } = parsed.data;
  const next = { ...rest, taxRateBps: taxRatePercent, taxDisplay: rest.taxDisplay as TaxDisplay };
  if (next.paymentMethods.includes("eft") && (!next.eftBankName || !next.eftAccountName || !next.eftAccountNumber)) {
    throw new DomainError("invalid", "Check the highlighted fields.", undefined, { eftBankName: "EFT needs the bank, account name and account number." });
  }

  return deps.db.$transaction(async (tx) => {
    const current = await getMarket(tx, code);
    if (next.countries.length === 0 && code !== CATCH_ALL) {
      throw new DomainError("invalid", "Check the highlighted fields.", undefined, { countries: "List at least one country." });
    }
    const others = await tx.market.findMany({ where: { code: { not: code } } });
    const clash = next.countries.find((c) => others.some((o) => o.countries.includes(c)));
    if (clash) throw new DomainError("invalid", "Check the highlighted fields.", undefined, { countries: `${clash} already belongs to another market.` });
    if (next.currency !== current.currency && (await tx.organisation.count({ where: { billingMarket: code } })) > 0) {
      throw new DomainError("invalid", "Check the highlighted fields.", undefined, { currency: "Customers are billed in this market's currency, so it can't change. Add a new market instead." });
    }

    const changed = FIELDS.filter((f) => show(current[f]) !== show(next[f]));
    if (!changed.length) return [];
    await tx.market.update({ where: { code }, data: next });
    await tx.marketChange.createMany({
      data: changed.map((f) => ({ marketCode: code, userId: deps.staff.userId, field: f, fromValue: show(current[f]), toValue: show(next[f]) })),
    });
    // Company > Banking holds the same account for the market's own currency; keep the two the same.
    if (changed.some((f) => f.startsWith("eft")) && next.eftBankName && next.eftAccountName && next.eftAccountNumber) {
      const account = { bankName: next.eftBankName, accountName: next.eftAccountName, accountNumber: next.eftAccountNumber, branchCode: next.eftBranchCode, swiftCode: next.eftSwiftCode, updatedById: deps.staff.userId };
      await tx.bankAccount.upsert({ where: { marketCode_currency: { marketCode: code, currency: next.currency } }, create: { marketCode: code, currency: next.currency, ...account }, update: account });
    }
    return changed;
  });
}

/** Switches a market on or off. The default market stays on. */
export async function setMarketEnabled(deps: MarketDeps, code: string, enabled: boolean) {
  assertStaffCan(deps.staff, "manageMarkets");
  return deps.db.$transaction(async (tx) => {
    const m = await getMarket(tx, code);
    if (m.enabled === enabled) return m;
    if (!enabled && m.isDefault) throw new DomainError("invalid", "This is the default market. Make another market the default first.");
    const updated = await tx.market.update({ where: { code }, data: { enabled } });
    await tx.marketChange.create({ data: { marketCode: code, userId: deps.staff.userId, field: "enabled", fromValue: String(m.enabled), toValue: String(enabled) } });
    return updated;
  });
}

/** Makes a market the default, where visitors go when theirs can't be told. */
export async function setDefaultMarket(deps: MarketDeps, code: string) {
  assertStaffCan(deps.staff, "manageMarkets");
  return deps.db.$transaction(async (tx) => {
    const m = await getMarket(tx, code);
    if (m.isDefault) return m;
    if (!m.enabled) throw new DomainError("invalid", "Switch the market on before making it the default.");
    const previous = await tx.market.findFirst({ where: { isDefault: true } });
    await tx.market.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const updated = await tx.market.update({ where: { code }, data: { isDefault: true } });
    await tx.marketChange.create({ data: { marketCode: code, userId: deps.staff.userId, field: "isDefault", fromValue: previous?.code ?? null, toValue: code } });
    return updated;
  });
}

export async function marketChanges(db: Pick<PrismaClient, "marketChange">, code: string) {
  return db.marketChange.findMany({ where: { marketCode: code }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } });
}
