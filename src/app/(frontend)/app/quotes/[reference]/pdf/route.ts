import { prisma } from "@/server/db";
import { quotePdf } from "@/server/documents/documents";
import { pdfResponse } from "@/server/documents/download";
import { env } from "@/server/env";
import { featureOn } from "@/server/features/features";
import { requireMember } from "@/server/org/context";
import { organisationQuote } from "@/server/quotes/quotes";

/** One of the organisation's quotes as a branded PDF, linking back to it in the console to accept. */
export async function GET(_req: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (!(await featureOn(prisma, "branded-pdfs"))) return new Response("Not found", { status: 404 });
  const { reference } = await params;
  const { db, organisation } = await requireMember();
  const quote = await organisationQuote(db, reference).catch(() => null);
  if (!quote || quote.status === "NEW") return new Response("Not found", { status: 404 });
  const market = await prisma.market.findUniqueOrThrow({ where: { code: quote.market } });
  const full = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id } });
  const pdf = await quotePdf(prisma, { quote, market, organisation: full, acceptUrl: `${env().APP_URL}/app/quotes/${encodeURIComponent(quote.reference)}` });
  return pdfResponse(pdf, `${quote.reference}.pdf`);
}
