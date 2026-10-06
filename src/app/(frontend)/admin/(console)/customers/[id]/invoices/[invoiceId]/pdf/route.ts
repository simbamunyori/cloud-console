import { requireStaffCan } from "@/server/admin/context";
import { billingAdapter } from "@/server/billing";
import { scopedBilling } from "@/server/billing/scoped";
import { prisma } from "@/server/db";
import { invoicePdf } from "@/server/documents/documents";
import { pdfResponse } from "@/server/documents/download";
import { env } from "@/server/env";
import { featureOn } from "@/server/features/features";
import { cardPaymentsOn } from "@/server/payments/live";

/** A customer's invoice as they see it, for staff answering a question about it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  await requireStaffCan("viewCustomers");
  if (!(await featureOn(prisma, "branded-pdfs"))) return new Response("Not found", { status: 404 });
  const { id, invoiceId } = await params;
  const organisation = await prisma.organisation.findUnique({ where: { id }, include: { market: true } });
  if (!organisation || !(await prisma.billingAccount.findUnique({ where: { organisationId: id } }))) return new Response("Not found", { status: 404 });
  const billing = await scopedBilling(prisma, billingAdapter(), id);
  const invoice = await billing.getInvoice(invoiceId);
  if (!invoice) return new Response("Not found", { status: 404 });
  const po = await prisma.invoicePoNumber.findUnique({ where: { organisationId_invoiceId: { organisationId: id, invoiceId } } });
  const pdf = await invoicePdf(prisma, { invoice, organisation, market: organisation.market, purchaseOrder: po?.poNumber ?? null, payOnline: organisation.market.paymentMethods.includes("card") && cardPaymentsOn(), appUrl: env().APP_URL });
  return pdfResponse(pdf, `${invoice.number}.pdf`);
}
