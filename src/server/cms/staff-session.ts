import type { WebsiteRole } from "@prisma/client";
import { SESSION_COOKIE, cookieValue } from "@/server/auth/cookies";
import { getSession, type AuthDeps } from "@/server/auth/service";
import { websiteRoleOf } from "@/server/staff/access";

export interface WebsiteStaff {
  userId: string;
  name: string;
  email: string;
  websiteRole: WebsiteRole;
}

/**
 * The staff member a request to the website editor comes from: a fully
 * signed-in staff session (password and authenticator code) whose account
 * has a website role. Anyone else gets null.
 */
export async function websiteStaffFromCookies(deps: AuthDeps, cookieHeader: string | null | undefined): Promise<WebsiteStaff | null> {
  const session = await getSession(deps, cookieValue(cookieHeader, SESSION_COOKIE.STAFF), "STAFF");
  if (session?.stage !== "ACTIVE") return null;
  const { user } = session;
  const websiteRole = websiteRoleOf(user);
  if (!websiteRole) return null;
  return { userId: user.id, name: user.name, email: user.email, websiteRole };
}
