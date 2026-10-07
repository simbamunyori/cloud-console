"use server";

import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { registerInterest } from "@/server/soc/soc";

/** Before Managed security is published: the customer's interest becomes a pre-sales lead (STRATEGY_ROLLOUT U5). */
export async function registerInterestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { devices: field(form, "devices"), note: field(form, "note") };
  return run(async () => {
    const { actor, organisation, session } = await requireMember();
    await registerInterest(prisma, { actor, organisation, email: session.user.email, ...values });
    return "Thanks. A security specialist will be in touch to talk it through.";
  }, values);
}
