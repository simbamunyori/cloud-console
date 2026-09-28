import { NextResponse, type NextRequest } from "next/server";
import { currentSession } from "@/server/auth/next";

/**
 * The site's "Find your domain" search. Builds the name from what was
 * typed and the ending picked, then opens the console's domain search:
 * straight away for a signed-in customer, after sign-in for anyone else.
 */
export async function GET(req: NextRequest) {
  const typed = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const tld = (req.nextUrl.searchParams.get("tld") ?? "").trim().toLowerCase();
  const name = typed && tld && /^\.[a-z0-9.-]{2,30}$/.test(tld) && !typed.includes(".") ? `${typed}${tld}` : typed;
  const search = name ? `/app/marketplace/domains?q=${encodeURIComponent(name)}` : "/app/marketplace/domains";
  const session = await currentSession();
  const to = session?.stage === "ACTIVE" ? search : `/sign-in?next=${encodeURIComponent(search)}`;
  return NextResponse.redirect(new URL(to, req.nextUrl.origin), 303);
}
