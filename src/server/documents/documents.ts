import type { Market, Organisation, PrismaClient, Quote, QuoteLine } from "@prisma/client";
import { formatDay } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import type { Invoice } from "@/server/billing/adapter";
import { bankFor, companyDetails, logoPng, type BankDetails, type CompanyDetails } from "@/server/company/company";
import { isPayable } from "@/server/payments/card";
import { renderBusinessPdf, type BusinessDocument } from "./business-pdf";

/**
 * The words on a branded invoice or quote (docs/STRATEGY_ROLLOUT.md, U1),
 * from Admin > Company, the market and the billing engine. The same
 * documents are downloaded in the console and attached to emails.
 */

type Db = Pick<PrismaClient, "companyProfile" | "market" | "bankAccount">;

const INVOICE_STATUS: Record<Invoice["status"], string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
  collections: "Unpaid",
  payment_pending: "Payment being confirmed",
};

function fromBlock(c: CompanyDetails, market: Market) {
  return {
    name: c.legalName,
    lines: [
      ...c.addressLines,
      `Registration ${market.companyRegistrationNumber ?? c.registrationNumber}`,
      ...(market.registeredAddress ? [`Registered office: ${market.registeredAddress}`] : []),
      ...(market.taxEnabled && market.taxRegistrationNumber ? [`${market.taxLabel} number ${market.taxRegistrationNumber}`] : []),
      ...[c.phone, c.email].filter((x): x is string => Boolean(x)),
    ],
  };
}

function toBlock(org: Pick<Organisation, "name" | "addressLine1" | "addressLine2" | "city" | "postcode" | "vatNumber" | "registrationNumber">) {
  return {
    name: org.name,
    lines: [org.addressLine1, org.addressLine2, [org.city, org.postcode].filter(Boolean).join(" "), org.vatNumber ? `VAT number ${org.vatNumber}` : null].filter((l): l is string => Boolean(l)),
  };
}

function footer(c: CompanyDetails) {
  return [
    ...(c.invoiceFooter ? [c.invoiceFooter] : []),
    `${c.legalName} · Registration ${c.registrationNumber} · ${c.addressLines.join(", ")}`,
    [c.email, c.phone, c.website?.replace(/^https:\/\//, "")].filter(Boolean).join(" · "),
  ];
}

const bankRows = (bank: BankDetails, reference: string): [string, string][] => [
  ["Bank", bank.bankName],
  ...(bank.branchName ? ([["Branch", bank.branchName]] as [string, string][]) : []),
  ["Account name", bank.accountName],
  ["Account number", bank.accountNumber],
  ...(bank.branchCode ? ([["Branch code", bank.branchCode]] as [string, string][]) : []),
  ...(bank.swiftCode ? ([["SWIFT code", bank.swiftCode]] as [string, string][]) : []),
  ["Payment reference", reference],
];

export interface InvoiceDocumentInput {
  invoice: Invoice;
  organisation: Pick<Organisation, "name" | "addressLine1" | "addressLine2" | "city" | "postcode" | "vatNumber" | "registrationNumber">;
  market: Market;
  purchaseOrder?: string | null;
  /** Card payments are on in this market: the PDF links to the invoice to pay online. */
  payOnline?: boolean;
  appUrl: string;
}

export async function invoiceDocument(db: Db, input: InvoiceDocumentInput): Promise<BusinessDocument> {
  const { invoice, market } = input;
  const c = await companyDetails(db);
  const fmt = (m: Invoice["total"]) => formatMoney(m, market.locale);
  const paidAmount = money(invoice.total.amountMinor - invoice.balance.amountMinor, invoice.total.currency);
  const payable = isPayable(invoice);
  const bank = payable ? await bankFor(db, market, invoice.total.currency) : null;
  const status = invoice.status === "paid" && invoice.paidOn ? `Paid on ${formatDay(invoice.paidOn, true)}` : INVOICE_STATUS[invoice.status];
  return {
    kind: "Invoice",
    number: invoice.number,
    status,
    from: fromBlock(c, market),
    to: toBlock(input.organisation),
    facts: [["Issued", formatDay(invoice.issuedOn, true)], ["Due", formatDay(invoice.dueOn, true)], ...(input.purchaseOrder ? ([["Purchase order", input.purchaseOrder]] as [string, string][]) : []), ["Currency", invoice.total.currency]],
    lines: invoice.lines.map((l) => ({ description: l.description, amount: fmt(l.amount) })),
    totals: [
      ["Subtotal", fmt(invoice.subtotal)],
      ...(invoice.taxRateBps > 0 || invoice.tax.amountMinor !== 0n ? ([[`${market.taxLabel} at ${(invoice.taxRateBps / 100).toLocaleString("en")}%`, fmt(invoice.tax)]] as [string, string][]) : []),
      ["Total", fmt(invoice.total), invoice.balance.amountMinor === invoice.total.amountMinor],
      ...(paidAmount.amountMinor > 0n ? ([["Paid", fmt(paidAmount)], ["Still to pay", fmt(invoice.balance), true]] as [string, string, boolean][]) : []),
    ],
    payment:
      payable && (bank || input.payOnline)
        ? {
            heading: bank ? "Pay by bank transfer (EFT)" : "How to pay",
            rows: bank ? bankRows(bank, invoice.number) : [],
            ...(input.payOnline ? { link: { label: "Pay online", url: `${input.appUrl}/app/billing/invoices/${encodeURIComponent(invoice.invoiceId)}` } } : {}),
          }
        : undefined,
    terms: c.paymentTerms ? [c.paymentTerms] : undefined,
    footer: footer(c),
  };
}

export async function invoicePdf(db: Db, input: InvoiceDocumentInput) {
  const [doc, logo, c] = await Promise.all([invoiceDocument(db, input), logoPng(db, "light"), companyDetails(db)]);
  return renderBusinessPdf(doc, logo, { title: `Invoice ${input.invoice.number}`, author: c.legalName });
}

export interface QuoteDocumentInput {
  quote: Quote & { lines: QuoteLine[] };
  market: Market;
  /** Where to accept it: the emailed link, or the quote in the console. */
  acceptUrl?: string;
  organisation?: Pick<Organisation, "name" | "addressLine1" | "addressLine2" | "city" | "postcode" | "vatNumber" | "registrationNumber"> | null;
}

export async function quoteDocument(db: Db, input: QuoteDocumentInput): Promise<BusinessDocument> {
  const { quote, market } = input;
  const c = await companyDetails(db);
  const cur = market.currency;
  const fmt = (minor: bigint) => formatMoney(money(minor, cur), market.locale);
  let monthly = 0n;
  let once = 0n;
  for (const l of quote.lines) {
    const amount = l.unitPriceMinor * BigInt(l.quantity);
    if (l.kind === "MONTHLY") monthly += amount;
    else once += amount;
  }
  const bank = await bankFor(db, market);
  const to = input.organisation ? toBlock(input.organisation) : { name: quote.company || quote.name, lines: [quote.company ? quote.name : null, quote.email, quote.phone].filter((l): l is string => Boolean(l)) };
  return {
    kind: "Quote",
    number: quote.reference,
    status: quote.validUntil ? `Holds until ${formatDay(quote.validUntil, true)}` : undefined,
    from: fromBlock(c, market),
    to,
    facts: [["Date", formatDay(quote.sentAt ?? quote.createdAt, true)], ...(quote.validUntil ? ([["Holds until", formatDay(quote.validUntil, true)]] as [string, string][]) : []), ["Currency", cur]],
    lines: quote.lines.map((l) => ({
      description: `${l.description}${l.quantity > 1 ? ` (${l.quantity} at ${fmt(l.unitPriceMinor)})` : ""}`,
      detail: l.kind === "MONTHLY" ? "Every month" : "Once",
      amount: `${fmt(l.unitPriceMinor * BigInt(l.quantity))}${l.kind === "MONTHLY" ? " a month" : ""}`,
    })),
    totals: [...(monthly > 0n ? ([["Total a month", fmt(monthly), true]] as [string, string, boolean][]) : []), ...(once > 0n ? ([["Total once", fmt(once), monthly === 0n]] as [string, string, boolean][]) : [])],
    notes: [...(quote.message ? [quote.message] : []), market.taxEnabled ? `Prices are in ${cur}, before ${market.taxLabel}, which is added on the invoice.` : `Prices are in ${cur}.`],
    payment: {
      heading: bank ? "Accept online, then pay by bank transfer" : "Accepting this quote",
      rows: bank ? bankRows(bank, "The invoice number, once invoiced") : [],
      ...(input.acceptUrl ? { link: { label: "Accept online", url: input.acceptUrl } } : {}),
    },
    terms: c.quoteTerms ? [c.quoteTerms] : undefined,
    footer: footer(c),
  };
}

export async function quotePdf(db: Db, input: QuoteDocumentInput) {
  const [doc, logo, c] = await Promise.all([quoteDocument(db, input), logoPng(db, "light"), companyDetails(db)]);
  return renderBusinessPdf(doc, logo, { title: `Quote ${input.quote.reference}`, author: c.legalName });
}
