import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import tokens from "@/config/theme/tokens.json";
import { bankFor, companyDetails, logoPng } from "@/server/company/company";
import { escapeHtml } from "@/server/email/layout";
import { parseNameservers } from "@/server/domains/registrar";
import { partnerConfig } from "@/server/partners/partners";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { signSync } from "./price-sync";

/**
 * Admin > Company into WHMCS (docs/STRATEGY_ROLLOUT.md, U1 items 2 and 6):
 * WHMCS's company name, email, Pay To text and logo, its invoice PDF
 * (the fourthgen theme reads the details pushed here), its invoice emails,
 * maintenance mode pointing at the console, and the Openprovider registrar
 * module's sign-in. Through the same addon as the price sync, signed the
 * same way; the addon only accepts the settings it lists
 * (whmcs/modules/addons/fourthgen_console/lib/CompanyHandler.php).
 */

type Db = Pick<PrismaClient, "companyProfile" | "market" | "bankAccount" | "partnerSetting" | "staffAuditEvent">;

export const companyPushUrlFor = (apiUrl: string) => apiUrl.replace(/\/includes\/api\.php$/, "/modules/addons/fourthgen_console/company.php");

export interface CompanyPushRequest {
  settings: Record<string, string>;
  company: Record<string, string | string[] | null>;
  currencies: { code: string; taxLabel?: string; taxNumber?: string; bank: Record<string, string | null> | null }[];
  logo: string;
  emailTemplates: { name: string; subject: string; message: string }[];
  registrar?: { module: "openprovider"; username: string; password: string; testMode: boolean };
}

/** "Fourth Generation Technologies <no-reply@...>" → the address, or null when it isn't one WHMCS should send from. */
export function senderAddress(mailFrom: string): string | null {
  const address = (/<([^>]+)>/.exec(mailFrom)?.[1] ?? mailFrom).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

const t = tokens.light;
const p = (html: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${html}</p>`;

/** The frame WHMCS wraps around every email it sends, matching the console's own (src/server/email/layout.ts). */
function emailFrame(appUrl: string, name: string, footer: string[]) {
  const header = `<!doctype html><html><body style="margin:0;background:${tokens.console.light.page};font-family:${tokens.font.family};color:${t.text}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${t.bg};border:1px solid ${t.border};border-radius:${tokens.radius.lg}">
<tr><td style="padding:32px">
<img src="${escapeHtml(`${appUrl}/api/company/logo/light`)}" width="168" height="44" alt="${escapeHtml(name)}" style="display:block;margin:0 0 32px;height:auto">`;
  const close = `</td></tr></table>
${footer.map((line, i) => `<p style="margin:${i ? 2 : 16}px 0 0;font-size:12px;line-height:18px;color:${t.textMuted}">${escapeHtml(line)}</p>`).join("")}
</td></tr></table></body></html>`;
  return { header, footer: close };
}

/** WHMCS's invoice emails in our words. {$...} are WHMCS's own merge fields. */
function invoiceEmails(appUrl: string): CompanyPushRequest["emailTemplates"] {
  const link = `${appUrl}/app/billing/invoices/{$invoice_id}`;
  const button = (label: string) =>
    `<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:${tokens.console.light.primaryFill};color:${t.onPrimary};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:${tokens.radius.md}">${label}</a></p>`;
  const facts = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;width:100%">${[
    ["Invoice", "{$invoice_num}"],
    ["Amount", "{$invoice_total}"],
    ["Due", "{$invoice_date_due}"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${t.border};color:${t.textMuted};font-size:14px">${k}</td><td style="padding:8px 0;border-bottom:1px solid ${t.border};font-size:14px;text-align:right;font-weight:600">${v}</td></tr>`,
    )
    .join("")}</table>`;
  const reference = p("To pay by bank transfer, use the bank details on the invoice and <strong>{$invoice_num}</strong> as the reference.");
  const hello = p("Hello {$client_first_name},");
  return [
    { name: "Invoice Created", subject: "Invoice {$invoice_num}", message: hello + p("Your invoice is ready.") + facts + reference + button("View and pay") },
    { name: "Credit Card Invoice Created", subject: "Invoice {$invoice_num}", message: hello + p("Your invoice is ready. It will be charged to your card on the due date.") + facts + button("View the invoice") },
    { name: "Invoice Payment Reminder", subject: "Reminder: invoice {$invoice_num} is due {$invoice_date_due}", message: hello + p("This is a reminder that this invoice is due soon.") + facts + reference + button("View and pay") },
    {
      name: "First Invoice Overdue Notice",
      subject: "Invoice {$invoice_num} is overdue",
      message: hello + p("We haven't received payment for this invoice yet. If you've already paid, thank you, and please ignore this email.") + facts + reference + button("View and pay"),
    },
    {
      name: "Second Invoice Overdue Notice",
      subject: "Second notice: invoice {$invoice_num} is overdue",
      message: hello + p("This invoice is still unpaid. Please pay it soon so your services carry on without a break.") + facts + reference + button("View and pay"),
    },
    {
      name: "Third Invoice Overdue Notice",
      subject: "Final notice: invoice {$invoice_num} is overdue",
      message: hello + p("This invoice is still unpaid, and services on it may be paused. Paying it brings them back straight away.") + facts + reference + button("View and pay"),
    },
    { name: "Invoice Payment Confirmation", subject: "Payment received for invoice {$invoice_num}", message: hello + p("Thank you. We've received your payment of {$invoice_last_payment_amount}.") + facts + button("View the invoice") },
  ];
}

/** What the push sends. The registrar password is in it only while Openprovider is switched on. */
export async function buildCompanyPush(db: Db, input: { appUrl: string; mailFrom: string }): Promise<CompanyPushRequest> {
  const appUrl = input.appUrl.replace(/\/$/, "");
  const [company, markets, openprovider, logo] = await Promise.all([
    companyDetails(db),
    db.market.findMany({ orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }),
    partnerConfig(db, "openprovider"),
    logoPng(db, "light"),
  ]);
  const footer = [`${company.legalName} · Registration ${company.registrationNumber}`, company.addressLines.join(", "), [company.email, company.phone].filter(Boolean).join(" · ")];
  const frame = emailFrame(appUrl, company.tradingName, footer);
  const nameservers = openprovider?.enabled && openprovider.settings.nameservers ? parseNameservers(openprovider.settings.nameservers) : [];
  const from = senderAddress(input.mailFrom);

  const settings: Record<string, string> = {
    CompanyName: company.legalName,
    Email: company.email,
    InvoicePayTo: [company.legalName, ...company.addressLines, `Company registration ${company.registrationNumber}`].join("\n"),
    LogoURL: `${appUrl}/api/company/logo/light`,
    SystemEmailsFromName: company.tradingName,
    Signature: `${company.tradingName}\n${appUrl}`,
    EmailGlobalHeader: frame.header,
    EmailGlobalFooter: frame.footer,
    EmailCSS: `a{color:${t.primaryText}}`,
    MaintenanceMode: "on",
    MaintenanceModeMessage: `Your account is in the ${company.tradingName} Cloud Console.`,
    MaintenanceModeURL: `${appUrl}/app`,
    AutoRenewDomainsonPayment: "on",
    Template: "fourthgen",
  };
  if (company.website) settings.Domain = company.website;
  if (from && !from.endsWith("@localhost")) settings.SystemEmailsFromEmail = from;
  if (Array.isArray(nameservers)) nameservers.slice(0, 4).forEach((ns, i) => (settings[`DefaultNameserver${i + 1}`] = ns));

  // One set of bank and tax details per currency; the default market's wins where two share one.
  const currencies = new Map<string, CompanyPushRequest["currencies"][number]>();
  const accounts = await db.bankAccount.findMany();
  for (const m of markets) {
    for (const code of [m.currency, ...accounts.filter((a) => a.marketCode === m.code && a.currency !== m.currency).map((a) => a.currency)]) {
      if (currencies.has(code)) continue;
      const bank = await bankFor(db, m, code);
      currencies.set(code, {
        code,
        ...(m.taxEnabled && m.taxRegistrationNumber && code === m.currency ? { taxLabel: m.taxLabel, taxNumber: m.taxRegistrationNumber } : {}),
        bank: bank
          ? { bankName: bank.bankName, branchName: bank.branchName ?? null, accountName: bank.accountName, accountNumber: bank.accountNumber, branchCode: bank.branchCode ?? null, swiftCode: bank.swiftCode ?? null }
          : null,
      });
    }
  }

  return {
    settings,
    company: {
      legalName: company.legalName,
      tradingName: company.tradingName,
      registrationNumber: company.registrationNumber,
      addressLines: company.addressLines,
      phone: company.phone,
      email: company.email,
      website: company.website,
      paymentTerms: company.paymentTerms,
      invoiceFooter: company.invoiceFooter,
      consoleUrl: appUrl,
    },
    currencies: [...currencies.values()],
    logo: logo.toString("base64"),
    emailTemplates: invoiceEmails(appUrl),
    ...(openprovider?.enabled && openprovider.settings.username && openprovider.secrets.password
      ? { registrar: { module: "openprovider" as const, username: openprovider.settings.username, password: openprovider.secrets.password, testMode: openprovider.settings.environment === "sandbox" } }
      : {}),
  };
}

export interface CompanyPushDeps {
  db: Db;
  url: string;
  secret: string;
  appUrl: string;
  mailFrom: string;
  fetcher?: typeof fetch;
  now?: () => Date;
}

export interface CompanyPushResult {
  dryRun: boolean;
  changes: string[];
  warnings: string[];
}

/** Sends the push, or with `apply: false` asks what it would change. Applying is audited. */
export async function pushCompany(deps: CompanyPushDeps, staff: StaffActor, options: { apply: boolean }): Promise<CompanyPushResult> {
  assertStaffCan(staff, "manageCompany");
  const request = await buildCompanyPush(deps.db, { appUrl: deps.appUrl, mailFrom: deps.mailFrom });
  const body = JSON.stringify({ dryRun: !options.apply, ...request });
  const timestamp = String(Math.floor((deps.now?.() ?? new Date()).getTime() / 1000));
  const requestId = randomBytes(16).toString("hex");
  const res = await (deps.fetcher ?? fetch)(deps.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-console-timestamp": timestamp, "x-console-request-id": requestId, "x-console-signature": signSync(deps.secret, timestamp, requestId, body) },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const answer = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; changes?: string[]; warnings?: string[] } | null;
  if (!answer?.ok) throw new Error(`WHMCS refused the company details (HTTP ${res.status}): ${answer?.error ?? "no answer it could read"}.`);
  const result = { dryRun: !options.apply, changes: answer.changes ?? [], warnings: answer.warnings ?? [] };
  if (options.apply && result.changes.length) {
    await deps.db.staffAuditEvent.create({
      data: {
        actorUserId: staff.userId,
        actorLabel: staffLabel(staff),
        action: "whmcs.company-push",
        summary: `Sent the company details to WHMCS: ${result.changes.length} ${result.changes.length === 1 ? "change" : "changes"}`,
        data: { changes: result.changes, warnings: result.warnings },
      },
    });
  }
  return result;
}
