"use server";

import { redirect } from "next/navigation";
import { field, run, type ActionState } from "@/server/action-state";
import { currentSession } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { claimQuote, declineQuoteByToken } from "@/server/quotes/quotes";

/** Takes the quote into the member's account, then opens it there to accept. */
export async function openQuoteInAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = field(form, "token");
  const session = await currentSession();
  if (session?.stage !== "ACTIVE") redirect(`/sign-in?next=${encodeURIComponent(`/quote/${token}`)}`);
  const { actor, organisation } = await requireMember();
  let reference = "";
  const result = await run(async () => {
    reference = await claimQuote(prisma, token, { actor, organisation });
  });
  if (!result.ok) return result;
  redirect(`/app/quotes/${reference}`);
}

export async function declineFromLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await declineQuoteByToken(prisma, field(form, "token"), field(form, "reason"));
    return "Thanks for letting us know. We've marked the quote as declined.";
  });
}
