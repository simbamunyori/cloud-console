import type { NextRequest } from "next/server";
import { requestContext } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { storeSearch } from "@/server/site/domain-store";
import { enabledMarkets } from "@/server/site/site";

export const dynamic = "force-dynamic";

/** The site's domain search. Public, so limited per address; answers only availability and the price book's price. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { market?: unknown; q?: unknown };
  const m = (await enabledMarkets()).find((x) => x.code === body.market);
  const q = typeof body.q === "string" ? body.q.slice(0, 100) : "";
  if (!m || !q.trim()) return Response.json({ error: "Type a name, like yourcompany." }, { status: 400 });
  try {
    const ip = (await requestContext()).ipAddress ?? "unknown";
    await enforce(prisma, `domainSearchPerIp:${ip}`, LIMITS.domainSearchPerIp);
    return Response.json({ results: await storeSearch(m, q) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof RateLimitedError) return Response.json({ error: "You've searched a lot in a short time. Try again in a few minutes." }, { status: 429 });
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 400 });
    console.error("Domain search failed:", e);
    return Response.json({ error: "Search isn't working right now. Try again shortly, or email us." }, { status: 503 });
  }
}
