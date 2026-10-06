import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { bankFor, companyDetails } from "@/server/company/company";
import { invoicePdf } from "@/server/documents/documents";
import { cardPaymentsOn } from "@/server/payments/live";
import { isPayable } from "@/server/payments/card";
import type { Template } from "./templates";

/** Branded invoice emails with the PDF (docs/STRATEGY_ROLLOUT.md, U1; src/server/billing/invoice-emails.ts). */

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const DOCUMENT_TEMPLATES: Record<string, Template> = {
  async "invoice.issued"(p, ctx) {
    const invoiceId = str(p.invoiceId);
    const org = await ctx.db.organisation.findUnique({ where: { id: str(p.organisationId) }, include: { market: true, billingAccount: true } });
    if (!org?.billingAccount) return null;
    const { billingAdapter } = await import("@/server/billing");
    const invoice = await billingAdapter().getInvoice(org.billingAccount.externalClientId, invoiceId);
    if (!invoice || invoice.status === "cancelled" || invoice.status === "draft") return null;
    const po = await ctx.db.invoicePoNumber.findUnique({ where: { organisationId_invoiceId: { organisationId: org.id, invoiceId } } }).catch(() => null);
    const payOnline = org.market.paymentMethods.includes("card") && cardPaymentsOn();
    const company = await companyDetails(ctx.db);
    const bank = isPayable(invoice) ? await bankFor(ctx.db, org.market, invoice.total.currency) : null;
    const pdf = await invoicePdf(ctx.db, { invoice, organisation: org, market: org.market, purchaseOrder: po?.poNumber ?? null, payOnline, appUrl: ctx.appUrl });
    const owed = formatMoney(invoice.balance, org.locale);
    const url = `${ctx.appUrl}/app/billing/invoices/${encodeURIComponent(invoiceId)}`;
    const paid = invoice.status === "paid";
    return {
      subject: paid ? `Invoice ${invoice.number} from ${company.tradingName} (paid)` : `Invoice ${invoice.number} from ${company.tradingName}: ${owed} due ${formatDay(invoice.dueOn, true)}`,
      body: {
        heading: paid ? `Invoice ${invoice.number}, paid` : `Your invoice ${invoice.number}`,
        paragraphs: [
          paid ? `Here is invoice ${invoice.number} for ${org.name}. It is already paid, so there is nothing to do.` : `Here is invoice ${invoice.number} for ${org.name}. The PDF is attached.`,
          ...(!paid && bank ? [`To pay by bank transfer, use the details below with ${invoice.number} as the reference so we can match your payment.`] : []),
        ],
        facts: [
          ["Invoice", invoice.number],
          ["Total", formatMoney(invoice.total, org.locale)],
          ...(!paid ? ([["To pay", owed], ["Due", formatDay(invoice.dueOn, true)]] as [string, string][]) : []),
          ...(!paid && bank
            ? ([
                ["Bank", bank.bankName],
                ["Account name", bank.accountName],
                ["Account number", bank.accountNumber],
                ...(bank.branchCode ? ([["Branch code", bank.branchCode]] as [string, string][]) : []),
                ...(bank.swiftCode ? ([["SWIFT code", bank.swiftCode]] as [string, string][]) : []),
                ["Reference", invoice.number],
              ] as [string, string][])
            : []),
        ],
        button: { label: paid ? "View the invoice" : payOnline ? "View and pay online" : "View the invoice", url },
        ...(company.paymentTerms && !paid ? { footnote: company.paymentTerms } : {}),
      },
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    };
  },
};
