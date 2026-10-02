import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { unsubscribeLead, unsubscribeLeadUrl } from "@/server/leads/capture";
import { DomainError } from "@/server/org/access";
import { siteUrl } from "@/server/site/urls";

/**
 * One-click unsubscribe (RFC 8058) for follow-up emails: mail apps POST
 * here from the List-Unsubscribe header. A GET, which link scanners also
 * make, only shows the page with the button.
 */

type Params = { params: Promise<{ token: string }> };

export async function POST(_req: Request, { params }: Params) {
  const token = decodeURIComponent((await params).token);
  try {
    await unsubscribeLead(prisma, token);
    return new NextResponse("Unsubscribed.", { status: 200 });
  } catch (e) {
    if (e instanceof DomainError) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}

export async function GET(_req: Request, { params }: Params) {
  const token = decodeURIComponent((await params).token);
  const lead = await prisma.lead.findUnique({ where: { unsubscribeToken: token }, select: { market: true, unsubscribeToken: true } });
  const url = lead ? unsubscribeLeadUrl(siteUrl(), lead) : null;
  return url ? NextResponse.redirect(url, 303) : new NextResponse("Not found.", { status: 404 });
}
