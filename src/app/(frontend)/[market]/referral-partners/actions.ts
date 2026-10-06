"use server";

import { revalidatePath } from "next/cache";
import { requestContext } from "@/server/auth/next";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { applyAsPartner, savePayoutDetails } from "@/server/referrals/referrals";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { siteMarket } from "@/server/site/site";

export async function applyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { name: field(form, "name"), company: field(form, "company"), email: field(form, "email"), phone: field(form, "phone"), kind: field(form, "kind") };
  if (field(form, "website")) return { ok: true, message: "Thank you." };
  try {
    return await run(async () => {
      const market = await siteMarket(field(form, "market"));
      await enforce(prisma, `toolPerIp:${(await requestContext()).ipAddress ?? "unknown"}`, LIMITS.toolPerIp);
      await applyAsPartner(prisma, { ...values, market: market.code, consent: field(form, "consent") === "yes" });
      await runSoon("email-deliver").catch(() => undefined);
      return `Thank you. We've emailed ${values.email.trim().toLowerCase()} to say your application arrived, and we'll be in touch once we've looked at it.`;
    }, values);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've sent several of these already. Try again in an hour.", values };
    throw e;
  }
}

export async function payoutDetailsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = field(form, "token");
  const result = await run(async () => {
    await savePayoutDetails(prisma, token, field(form, "details"));
    return "Saved. Only our finance team can see them.";
  });
  if (result.ok) revalidatePath(`/${field(form, "market")}/referral-partners/${token}`);
  return result;
}
