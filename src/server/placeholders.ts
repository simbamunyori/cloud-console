import type { PrismaClient } from "@prisma/client";
import type { Env } from "./env";

/**
 * Development placeholders that must never reach customers. In production
 * the server refuses to start while any is still set (see
 * src/instrumentation.ts). ALLOW_PLACEHOLDERS=yes lets a demo or CI server
 * start anyway, with a warning.
 */

/** Demo accounts the seed creates, with a published password. */
export const DEMO_ACCOUNT_EMAILS = ["demo@kgalehill.co.bw", "staff@example.co.bw", "finance@example.co.bw", "setup@example.co.bw", "support@example.co.bw"];

const isLocalhost = (value: string) => /@localhost\b|\/\/localhost\b|\/\/127\.0\.0\.1\b/i.test(value);
const allZeros = (value: string | null) => Boolean(value && /^0+$/.test(value.replace(/[\s-]/g, "")));

type PlaceholderEnv = Pick<Env, "APP_URL" | "MAIL_FROM"> & {
  STATUS_PAGE_URL?: string;
  BILLING_ADAPTER?: Env["BILLING_ADAPTER"];
  TENANT_PROVIDER?: Env["TENANT_PROVIDER"];
  WHMCS_API_URL?: string;
  WHMCS_ENVIRONMENT?: Env["WHMCS_ENVIRONMENT"];
  /** Whether each WHMCS secret is set; the values never come here. */
  WHMCS_API_IDENTIFIER_SET?: boolean;
  WHMCS_API_SECRET_SET?: boolean;
};

/** Each placeholder still set, in words that say where to fix it. Empty when there are none. */
export async function findPlaceholders(db: Pick<PrismaClient, "market" | "fxRate" | "user">, e: PlaceholderEnv): Promise<string[]> {
  const found: string[] = [];
  if (e.BILLING_ADAPTER === "stub") found.push("BILLING_ADAPTER is stub, the built-in test billing. Set it to whmcs (see docs/whmcs-setup.md).");
  if (e.BILLING_ADAPTER === "whmcs") {
    const missing = [!e.WHMCS_API_URL && "WHMCS_API_URL", !e.WHMCS_API_IDENTIFIER_SET && "WHMCS_API_IDENTIFIER", !e.WHMCS_API_SECRET_SET && "WHMCS_API_SECRET"].filter(Boolean);
    if (missing.length) found.push(`BILLING_ADAPTER is whmcs but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set (see docs/whmcs-setup.md).`);
    if (e.WHMCS_ENVIRONMENT !== "production") found.push("WHMCS_ENVIRONMENT is not production, so this console points at the test WHMCS. Reset WHMCS and set it to production (docs/whmcs-setup.md, section 9).");
  }
  if (e.TENANT_PROVIDER === "stub") found.push("TENANT_PROVIDER is stub, which changes demo tenants only. Set it to manual so licence changes reach staff as tasks.");
  if (isLocalhost(e.APP_URL)) found.push(`APP_URL is ${e.APP_URL}. Set the console's public address.`);
  if (isLocalhost(e.MAIL_FROM)) found.push(`MAIL_FROM is ${e.MAIL_FROM}. Set a real sending address.`);
  if (e.STATUS_PAGE_URL && /\/\/[^/]*example\.com\b/i.test(e.STATUS_PAGE_URL)) found.push(`STATUS_PAGE_URL is ${e.STATUS_PAGE_URL}. Set the real status page, or leave it unset.`);

  for (const m of await db.market.findMany({ orderBy: { sortOrder: "asc" } })) {
    if (isLocalhost(m.supportEmail)) found.push(`Market ${m.code}: the support email is ${m.supportEmail}. Set it at /admin/markets/${m.code}.`);
    if (/\bdemo\b/i.test(m.eftBankName ?? "") || allZeros(m.eftAccountNumber) || allZeros(m.eftBranchCode)) {
      found.push(`Market ${m.code}: the bank details are the demo ones. Enter the real account at /admin/markets/${m.code}, or turn bank transfer off.`);
    }
  }

  // Staff-entered rates record who set them; seeded rates don't.
  const seeded = await db.fxRate.findMany({ where: { setById: null }, select: { month: true, base: true, quote: true }, orderBy: [{ month: "asc" }, { base: "asc" }] });
  if (seeded.length) {
    const sample = seeded.slice(0, 3).map((r) => `${r.base} to ${r.quote} for ${r.month}`).join(", ");
    found.push(`${seeded.length} exchange ${seeded.length === 1 ? "rate is a" : "rates are"} demo ${seeded.length === 1 ? "value" : "values"} (${sample}${seeded.length > 3 ? ", and more" : ""}). Enter the real rates at /admin/pricing.`);
  }

  const demo = await db.user.findMany({ where: { email: { in: DEMO_ACCOUNT_EMAILS } }, select: { email: true } });
  if (demo.length) found.push(`Demo accounts with a published password exist (${demo.map((u) => u.email).join(", ")}). Remove them.`);
  return found;
}

/** Throws in production while placeholders remain, unless ALLOW_PLACEHOLDERS=yes. */
export async function assertNoPlaceholders(db: Pick<PrismaClient, "market" | "fxRate" | "user">, e: PlaceholderEnv & Pick<Env, "NODE_ENV">, allow = process.env.ALLOW_PLACEHOLDERS === "yes") {
  if (e.NODE_ENV !== "production") return;
  const found = await findPlaceholders(db, e);
  if (!found.length) return;
  const list = found.map((f) => `  - ${f}`).join("\n");
  if (allow) {
    console.warn(`ALLOW_PLACEHOLDERS=yes: starting with development placeholders still set. Never do this for customers.\n${list}`);
    return;
  }
  throw new Error(`Refusing to start in production with development placeholders still set:\n${list}\nFix them, or set ALLOW_PLACEHOLDERS=yes for a demo server.`);
}
