import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Market, PrismaClient } from "@prisma/client";
import { cache } from "react";
import { z } from "zod";
import { company as fixed } from "@/config/app";
import { env } from "@/server/env";
import type { EftDetails } from "@/server/markets/markets";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Admin > Company (docs/STRATEGY_ROLLOUT.md, U1): the legal name,
 * registration, address, contacts, logos, bank details and the words at the
 * foot of invoices and quotes, used on invoices, quotes, emails, the website
 * footer and WHMCS. Until an Admin saves it, it shows the values the
 * platform already had.
 */

export interface CompanyDetails {
  legalName: string;
  tradingName: string;
  registrationNumber: string;
  /** One part per line. */
  addressLines: string[];
  phone: string | null;
  email: string;
  website: string | null;
  invoiceFooter: string | null;
  paymentTerms: string | null;
  quoteTerms: string | null;
  hasLightLogo: boolean;
  hasDarkLogo: boolean;
  updatedAt: Date | null;
}

type CompanyDb = Pick<PrismaClient, "companyProfile" | "market">;

/** What the platform already said, from our terms of service and src/config/app.ts. */
export const COMPANY_DEFAULTS = {
  legalName: fixed.legalName,
  tradingName: fixed.name,
  registrationNumber: fixed.registrationNumber,
  address: "Plot 27860, Block 3\nGaborone\nP.O. Box 550152, Mogoditshane\nBotswana",
  phone: "+267 74339657",
  email: "support@fourthgeneration.technology",
  invoiceFooter: "Thank you for your business.",
  paymentTerms: "Payment is due by the due date shown. Use the invoice number as your payment reference.",
  quoteTerms: "Prices are as shown until the date the quote holds to. Accepting the quote places the order at these prices under our terms of service.",
};

/** Lines as typed; an address typed on one line is split at its commas. */
const lines = (text: string) => (/\r?\n/.test(text) ? text.split(/\r?\n/) : text.split(",")).map((l) => l.trim()).filter(Boolean);

/** A development install's support@localhost isn't offered as our address. */
const realEmail = (v: string | null | undefined): v is string => Boolean(v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));

async function load(db: CompanyDb): Promise<CompanyDetails> {
  const [row, market] = await Promise.all([
    db.companyProfile.findUnique({ where: { id: "company" }, omit: { logoLight: true, logoDark: true } }),
    db.market.findFirst({ where: { isDefault: true } }),
  ]);
  const logos = row ? await db.companyProfile.findUnique({ where: { id: "company" }, select: { logoLight: true, logoDark: true } }) : null;
  const site = (env().SITE_URL || env().APP_URL).replace(/\/$/, "");
  // Only a real address is offered as the website (a development server's isn't).
  const website = site.startsWith("https://") ? site : null;
  return {
    legalName: row?.legalName ?? COMPANY_DEFAULTS.legalName,
    tradingName: row?.tradingName ?? COMPANY_DEFAULTS.tradingName,
    registrationNumber: row?.registrationNumber ?? COMPANY_DEFAULTS.registrationNumber,
    addressLines: lines(row?.address ?? COMPANY_DEFAULTS.address),
    phone: row ? row.phone : (market?.supportPhone ?? COMPANY_DEFAULTS.phone),
    email: row?.email ?? (realEmail(market?.supportEmail) ? market!.supportEmail : COMPANY_DEFAULTS.email),
    website: row ? row.website : website,
    invoiceFooter: row ? row.invoiceFooter : COMPANY_DEFAULTS.invoiceFooter,
    paymentTerms: row ? row.paymentTerms : COMPANY_DEFAULTS.paymentTerms,
    quoteTerms: row ? row.quoteTerms : COMPANY_DEFAULTS.quoteTerms,
    hasLightLogo: Boolean(logos?.logoLight?.length),
    hasDarkLogo: Boolean(logos?.logoDark?.length),
    updatedAt: row?.updatedAt ?? null,
  };
}

export function companyDetails(db: CompanyDb) {
  return load(db);
}

/** Read once per request, for pages. */
export const cachedCompany = cache((db: CompanyDb) => load(db));

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));
const required = (max: number, what: string) => z.string().trim().min(1, `Enter ${what}.`).max(max, `Keep it under ${max} characters.`);

export const companySchema = z.object({
  legalName: required(120, "the legal name"),
  tradingName: required(120, "the trading name"),
  registrationNumber: required(40, "the registration number"),
  address: required(400, "the address"),
  phone: text(40),
  email: required(120, "an email address").pipe(z.email("Enter an email address.")),
  website: text(200).refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), "Start with https://."),
  invoiceFooter: text(400),
  paymentTerms: text(600),
  quoteTerms: text(1200),
});

export type CompanyInput = z.input<typeof companySchema>;

const FIELD_LABEL: Record<keyof CompanyInput, string> = {
  legalName: "Legal name",
  tradingName: "Trading name",
  registrationNumber: "Registration number",
  address: "Address",
  phone: "Phone",
  email: "Email",
  website: "Website",
  invoiceFooter: "Invoice footer",
  paymentTerms: "Payment terms",
  quoteTerms: "Quote terms",
};

function staffAudit(tx: Pick<PrismaClient, "staffAuditEvent">, staff: StaffActor, action: string, summary: string, data?: Record<string, unknown>) {
  return tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action, summary, data: data as object | undefined } });
}

/** Saves the company details. Returns the labels of what changed. */
export async function saveCompany(deps: { db: PrismaClient; staff: StaffActor }, input: CompanyInput) {
  assertStaffCan(deps.staff, "manageCompany");
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  }
  const next = { ...parsed.data, address: lines(parsed.data.address).join("\n") };
  const before = await load(deps.db);
  const was: Record<keyof CompanyInput, string | null> = {
    legalName: before.legalName,
    tradingName: before.tradingName,
    registrationNumber: before.registrationNumber,
    address: before.addressLines.join("\n"),
    phone: before.phone,
    email: before.email,
    website: before.website,
    invoiceFooter: before.invoiceFooter,
    paymentTerms: before.paymentTerms,
    quoteTerms: before.quoteTerms,
  };
  const changed = (Object.keys(FIELD_LABEL) as (keyof CompanyInput)[]).filter((k) => (was[k] ?? null) !== (next[k] ?? null));
  const exists = Boolean(before.updatedAt);
  if (!changed.length && exists) return [];
  await deps.db.$transaction(async (tx) => {
    await tx.companyProfile.upsert({ where: { id: "company" }, create: { id: "company", ...next, updatedById: deps.staff.userId }, update: { ...next, updatedById: deps.staff.userId } });
    await staffAudit(tx, deps.staff, "company.saved", `Changed the company details: ${changed.map((k) => FIELD_LABEL[k]).join(", ") || "first save"}`, {
      changes: Object.fromEntries(changed.map((k) => [k, { from: was[k], to: next[k] }])),
    });
  });
  return changed.map((k) => FIELD_LABEL[k]);
}

// ─── Logos ──────────────────────────────────────────────────────────

export type LogoKind = "light" | "dark";
const MAX_LOGO_BYTES = 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG width and height from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = Buffer.from(bytes);
  if (b.length < 24 || !b.subarray(0, 8).equals(PNG) || b.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** A PNG up to 1 MB, at least 300 pixels wide, wider than tall, as a logo lockup is. */
export async function saveLogo(deps: { db: PrismaClient; staff: StaffActor }, kind: LogoKind, bytes: Uint8Array | null) {
  assertStaffCan(deps.staff, "manageCompany");
  if (bytes) {
    if (bytes.length > MAX_LOGO_BYTES) throw new DomainError("invalid", "Use a PNG under 1 MB.", `logo-${kind}`);
    const size = pngSize(bytes);
    if (!size) throw new DomainError("invalid", "Upload a PNG file.", `logo-${kind}`);
    if (size.width < 300 || size.width < size.height) throw new DomainError("invalid", "Use the full logo, at least 300 pixels wide and wider than it is tall.", `logo-${kind}`);
  }
  const details = await load(deps.db);
  const data = kind === "light" ? { logoLight: bytes ? Buffer.from(bytes) : null } : { logoDark: bytes ? Buffer.from(bytes) : null };
  await deps.db.$transaction(async (tx) => {
    await tx.companyProfile.upsert({
      where: { id: "company" },
      create: {
        id: "company",
        legalName: details.legalName,
        tradingName: details.tradingName,
        registrationNumber: details.registrationNumber,
        address: details.addressLines.join("\n"),
        phone: details.phone,
        email: details.email,
        website: details.website,
        invoiceFooter: details.invoiceFooter,
        paymentTerms: details.paymentTerms,
        quoteTerms: details.quoteTerms,
        ...data,
        updatedById: deps.staff.userId,
      },
      update: { ...data, updatedById: deps.staff.userId },
    });
    await staffAudit(tx, deps.staff, "company.logo", `${bytes ? "Uploaded" : "Went back to the standard"} ${kind} logo`);
  });
}

const BRAND_LOGO: Record<LogoKind, string> = { light: "fgt-logo-1280.png", dark: "fgt-logo-reverse-1280.png" };

/** The logo as PNG: the uploaded one, or the brand pack's. */
export async function logoPng(db: Pick<PrismaClient, "companyProfile">, kind: LogoKind): Promise<Buffer> {
  const row = await db.companyProfile.findUnique({ where: { id: "company" }, select: kind === "light" ? { logoLight: true } : { logoDark: true } });
  const uploaded = kind === "light" ? (row as { logoLight?: Uint8Array | null } | null)?.logoLight : (row as { logoDark?: Uint8Array | null } | null)?.logoDark;
  if (uploaded?.length) return Buffer.from(uploaded);
  return brandAsset("png", BRAND_LOGO[kind]);
}

/** A file from the brand pack: public/brand once built, else brand/ itself (tests run before a build). */
export async function brandAsset(folder: "png" | "fonts", file: string): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", folder, file));
  } catch {
    return readFile(path.join(process.cwd(), "brand", folder, file));
  }
}

// ─── Banking ────────────────────────────────────────────────────────

export interface BankDetails extends EftDetails {
  branchName?: string;
  currency: string;
}

type BankDb = Pick<PrismaClient, "bankAccount">;

/**
 * The account a customer in this market pays into, in the invoice's
 * currency: Company > Banking, or the market's own settings for its
 * currency. Null while EFT is off in the market or nothing is set.
 */
export async function bankFor(db: BankDb, market: Market, currency = market.currency): Promise<BankDetails | null> {
  if (!market.paymentMethods.includes("eft")) return null;
  const row = await db.bankAccount.findUnique({ where: { marketCode_currency: { marketCode: market.code, currency } } });
  if (row) {
    return {
      bankName: row.bankName,
      branchName: row.branchName ?? undefined,
      accountName: row.accountName,
      accountNumber: row.accountNumber,
      branchCode: row.branchCode ?? undefined,
      swiftCode: row.swiftCode ?? undefined,
      currency,
    };
  }
  if (currency !== market.currency || !market.eftBankName || !market.eftAccountName || !market.eftAccountNumber) return null;
  return { bankName: market.eftBankName, accountName: market.eftAccountName, accountNumber: market.eftAccountNumber, branchCode: market.eftBranchCode ?? undefined, swiftCode: market.eftSwiftCode ?? undefined, currency };
}

export async function bankAccounts(db: Pick<PrismaClient, "bankAccount" | "market">) {
  const [rows, markets] = await Promise.all([db.bankAccount.findMany({ orderBy: [{ marketCode: "asc" }, { currency: "asc" }] }), db.market.findMany({ orderBy: { sortOrder: "asc" } })]);
  return { rows, markets };
}

export const bankSchema = z.object({
  marketCode: z.string().trim().min(1, "Choose a market."),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use the three-letter code, like BWP.")
    .transform((v) => v.toUpperCase()),
  bankName: required(80, "the bank"),
  branchName: text(80),
  accountName: required(120, "the account name"),
  accountNumber: required(40, "the account number"),
  branchCode: text(20),
  swiftCode: text(20).refine((v) => v === null || /^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(v), "A SWIFT code has 8 or 11 letters and numbers."),
});

export type BankInput = z.input<typeof bankSchema>;

/** Adds or changes the account for a market and currency. The market's own currency also updates the market settings. */
export async function saveBankAccount(deps: { db: PrismaClient; staff: StaffActor }, input: BankInput) {
  assertStaffCan(deps.staff, "manageCompany");
  const parsed = bankSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  }
  const { marketCode, currency, ...account } = parsed.data;
  return deps.db.$transaction(async (tx) => {
    const market = await tx.market.findUnique({ where: { code: marketCode } });
    if (!market) throw new DomainError("invalid", "Check the highlighted fields.", undefined, { marketCode: "Choose a market." });
    const before = await tx.bankAccount.findUnique({ where: { marketCode_currency: { marketCode, currency } } });
    await tx.bankAccount.upsert({
      where: { marketCode_currency: { marketCode, currency } },
      create: { marketCode, currency, ...account, updatedById: deps.staff.userId },
      update: { ...account, updatedById: deps.staff.userId },
    });
    if (currency === market.currency) {
      const eft = { eftBankName: account.bankName, eftAccountName: account.accountName, eftAccountNumber: account.accountNumber, eftBranchCode: account.branchCode, eftSwiftCode: account.swiftCode };
      const changed = (Object.keys(eft) as (keyof typeof eft)[]).filter((k) => (market[k] ?? null) !== (eft[k] ?? null));
      if (changed.length) {
        await tx.market.update({ where: { code: marketCode }, data: eft });
        await tx.marketChange.createMany({ data: changed.map((f) => ({ marketCode, userId: deps.staff.userId, field: f, fromValue: market[f] ?? null, toValue: eft[f] ?? null })) });
      }
    }
    await staffAudit(tx, deps.staff, "company.bank", `${before ? "Changed" : "Added"} the ${market.name} ${currency} bank account (${account.bankName}, ending ${account.accountNumber.slice(-4)})`, { marketCode, currency });
  });
}
