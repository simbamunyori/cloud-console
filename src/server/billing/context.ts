import "server-only";
import { cache } from "react";
import { todayIn } from "@/lib/dates";
import { requireMember } from "@/server/org/context";
import { billingFor } from "./index";

/**
 * A customer page's billing: the member context plus billing bound to
 * their organisation, and today's date where the organisation is.
 * Cached per request.
 */
export const requireBilling = cache(async () => {
  const member = await requireMember();
  const billing = await billingFor(member.organisation.id);
  return { ...member, billing, today: todayIn(member.organisation.timeZone), currency: member.organisation.currency };
});
