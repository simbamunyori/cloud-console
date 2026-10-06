import { requireBilling } from "@/server/billing/context";
import { prisma } from "@/server/db";
import { invoicePdf } from "@/server/documents/documents";
import { pdfResponse } from "@/server/documents/download";
import { featureOn } from "@/server/features/features";
import { cardPaymentsOn } from "@/server/payments/live";
import { poNumbers } from "@/server/billing/po";
import { env } from "@/server/env";

/** The invoice as a branded PDF, for the customer's own invoices (Admin > Features > Invoice and quote PDFs). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await featureOn(prisma, "branded-pdfs"))) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const { billing, db, organisation, market } = await requireBilling();
  const invoice = await billing.getInvoice(id);
  if (!invoice) return new Response("Not found", { status: 404 });
  const po = (await poNumbers(db, [invoice.invoiceId])).get(invoice.invoiceId) ?? null;
  const pdf = await invoicePdf(prisma, { invoice, organisation, market, purchaseOrder: po, payOnline: market.paymentMethods.includes("card") && cardPaymentsOn(), appUrl: env().APP_URL });
  return pdfResponse(pdf, `${invoice.number}.pdf`);
}
