import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requireActiveSession } from "@/server/auth/next";
import { prisma, tenantDb } from "@/server/db";
import type { Actor } from "./access";

/**
 * Everything a signed-in customer page needs: who is acting, in which
 * organisation, and a database client scoped to it. Cached per request,
 * so the layout and page share one lookup.
 */
export const requireMember = cache(async () => {
  const session = await requireActiveSession();
  const membership = session.activeOrganisationId
    ? await prisma.membership.findUnique({
        where: { organisationId_userId: { organisationId: session.activeOrganisationId, userId: session.userId } },
        include: { organisation: { include: { market: true } } },
      })
    : null;
  if (!membership || !membership.active || membership.organisation.deletedAt) {
    // Removed from this organisation but still in another: open that one.
    const other = await prisma.membership.findFirst({
      where: { userId: session.userId, active: true, organisation: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { organisationId: true },
    });
    if (!other) redirect("/sign-in?expired=1");
    await prisma.session.update({ where: { id: session.id }, data: { activeOrganisationId: other.organisationId } });
    redirect("/app");
  }
  const actor: Actor = {
    membershipId: membership.id,
    userId: session.userId,
    name: session.user.name,
    role: membership.role,
  };
  const { market, ...organisation } = membership.organisation;
  return {
    session,
    actor,
    organisation,
    /** The account's market: its currency, locale, contacts and bank details, wherever the member is browsing from. */
    market,
    db: tenantDb(membership.organisation.id),
  };
});

export type MemberContext = Awaited<ReturnType<typeof requireMember>>;
