import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { authDeps } from "@/server/auth/next";
import { websiteStaffFromCookies } from "@/server/cms/staff-session";

/**
 * The website editor's preview: turns on draft mode for staff with a
 * website role and sends them to the page, which then shows its latest
 * draft. Anyone else gets a 404. Only addresses on this site are allowed.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const staff = await websiteStaffFromCookies(authDeps(), req.headers.get("cookie"));
  if (!staff || !/^\/[a-z]{2,8}(\/[a-z0-9-]*)?$/.test(path)) return new NextResponse("Not found", { status: 404 });
  (await draftMode()).enable();
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), 307);
}
