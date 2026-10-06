import { prisma } from "@/server/db";
import { pdfResponse } from "@/server/documents/download";
import { env } from "@/server/env";
import { featureOn } from "@/server/features/features";
import { requireMember } from "@/server/org/context";
import { reportFileName, reportPdf } from "@/server/security/reports";

/** One of the organisation's monthly security reports as a branded PDF (STRATEGY_ROLLOUT U4). */
export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  if (!(await featureOn(prisma, "security-score"))) return new Response("Not found", { status: 404 });
  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Not found", { status: 404 });
  const { db, organisation } = await requireMember();
  const report = await db.securityReport.findFirst({ where: { month } });
  if (!report) return new Response("Not found", { status: 404 });
  return pdfResponse(await reportPdf(prisma, report, organisation.name, env().APP_URL), reportFileName(month));
}
