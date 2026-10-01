import { NextResponse, type NextRequest } from "next/server";
import { MARKET_COOKIE } from "@/lib/domain/markets";
import { enabledMarkets } from "@/server/site/site";
import { cookieDomain, siteUrl } from "@/server/site/urls";

/**
 * The country switcher: remembers the visitor's market in a cookie, which
 * beats detection on "/", and opens the same page in that market. Only
 * paths on this site are followed.
 */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const market = (await enabledMarkets()).find((m) => m.code === to);
  if (!market) return NextResponse.redirect(new URL("/", siteUrl()));
  const safePath = /^(\/[a-z0-9-]+)*$/.test(path) ? path : "";
  const res = NextResponse.redirect(new URL(`/${market.code}${safePath}`, siteUrl()));
  res.cookies.set(MARKET_COOKIE, market.code, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: true, domain: cookieDomain() });
  return res;
}
