import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { quotePdf } from "@/server/documents/documents";
import { pdfResponse } from "@/server/documents/download";
import { featureOn } from "@/server/features/features";
import { quoteForStaff } from "@/server/quotes/quotes";

/** A priced quote as the customer gets it, for staff to check or send by hand. */
export async function GET(_req: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { staff } = await requireStaffCan("manageQuotes");
  if (!(await featureOn(prisma, "branded-pdfs"))) return new Response("Not found", { status: 404 });
  const { reference } = await params;
  const quote = await quoteForStaff(prisma, staff, reference).catch(() => null);
  if (!quote || !quote.lines.length) return new Response("Not found", { status: 404 });
  const market = await prisma.market.findUniqueOrThrow({ where: { code: quote.market } });
  const organisation = quote.organisationId ? await prisma.organisation.findUnique({ where: { id: quote.organisationId } }) : null;
  return pdfResponse(await quotePdf(prisma, { quote, market, organisation }), `${quote.reference}.pdf`);
}
