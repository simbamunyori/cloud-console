import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { receiveWebhook } from "@/server/soc/soc";

/**
 * Alerts and device lists from the active security provider
 * (docs/security-provider.md, STRATEGY_ROLLOUT U5). Signed with the
 * webhook secret set in Admin > Partners > Security provider.
 */
export async function POST(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const body = await req.text();
  if (body.length > 256_000) return new NextResponse("Too large.", { status: 413 });
  const result = await receiveWebhook(prisma, (await params).providerId, { signature: req.headers.get("x-signature"), timestamp: req.headers.get("x-timestamp") }, body);
  return new NextResponse(result.message, { status: result.status });
}
