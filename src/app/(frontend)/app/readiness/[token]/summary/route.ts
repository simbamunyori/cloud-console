import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { claimReadiness, readinessPdf } from "@/server/tools/readiness-store";

/** The readiness summary as a PDF, for the organisation that holds it. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { organisation, market } = await requireMember();
  const row = await claimReadiness(prisma, token, organisation.id);
  if (!row) return new Response("Not found", { status: 404 });
  const pdf = readinessPdf(row, { law: market.dataProtectionLaw ?? "data protection law", organisation: organisation.name });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="data-protection-readiness.pdf"',
      "cache-control": "private, no-store",
    },
  });
}
