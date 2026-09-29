"use server";

import { redirect } from "next/navigation";
import type { QuoteRequestState } from "@/components/quotes/request-form";
import { field, run, type ActionState } from "@/server/action-state";
import { requireBilling } from "@/server/billing/context";
import { runSoon } from "@/server/jobs/boss";
import { requireMember } from "@/server/org/context";
import { acceptQuote, declineQuote } from "@/server/quotes/quotes";
import { takeQuoteRequest } from "@/server/quotes/request-action";

/** From the console: the request belongs to the account straight away. */
export async function requestQuoteFromConsoleAction(_prev: QuoteRequestState, form: FormData): Promise<QuoteRequestState> {
  const { actor, organisation } = await requireMember();
  return takeQuoteRequest(form, { market: organisation.billingMarket, organisationId: organisation.id, userId: actor.userId });
}

export async function acceptQuoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, billing, organisation, actor } = await requireBilling();
  let reference = "";
  const result = await run(async () => {
    const order = await acceptQuote({ db, billing, organisation, actor }, field(form, "reference"), form.get("startNow") === "on");
    reference = order.reference;
  });
  if (!result.ok) return result;
  await runSoon("email-deliver").catch(() => undefined);
  redirect(`/app/orders/${reference}?new=1`);
}

export async function declineQuoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  return run(async () => {
    await declineQuote({ db, organisation, actor }, field(form, "reference"), field(form, "reason"));
    return "Declined. Thanks for letting us know.";
  });
}
