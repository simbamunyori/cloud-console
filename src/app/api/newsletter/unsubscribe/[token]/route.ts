import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { unsubscribe, unsubscribeUrl } from "@/server/newsletter/newsletter";
import { DomainError } from "@/server/org/access";
import { siteUrl } from "@/server/site/urls";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the
 * newsletter's List-Unsubscribe header, with no page in between. A GET,
 * which link scanners also make, only shows the unsubscribe page.
 */

type Params = { params: Promise<{ token: string }> };

export async function POST(_req: Request, { params }: Params) {
  const token = decodeURIComponent((await params).token);
  try {
    await unsubscribe(prisma, token);
    return new NextResponse("Unsubscribed.", { status: 200 });
  } catch (e) {
    if (e instanceof DomainError) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}

export async function GET(_req: Request, { params }: Params) {
  const token = decodeURIComponent((await params).token);
  const row = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token }, select: { marketCode: true, unsubscribeToken: true } });
  if (!row) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.redirect(unsubscribeUrl(siteUrl(), row), 303);
}
