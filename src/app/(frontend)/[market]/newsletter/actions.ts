"use server";

import { field, run, type ActionState } from "@/server/action-state";
import { requestContext } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { confirmSubscription, subscribe, unsubscribe } from "@/server/newsletter/newsletter";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { siteMarket } from "@/server/site/site";

/** The footer's sign-up. A filled-in hidden "website" field is a bot: it looks as if it worked. */
export async function subscribeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { email: field(form, "email") };
  if (field(form, "website")) return { ok: true, message: "Check your inbox to confirm." };
  try {
    return await run(async () => {
      const market = await siteMarket(field(form, "market"));
      const ip = (await requestContext()).ipAddress ?? "unknown";
      await enforce(prisma, `newsletterPerIp:${ip}`, LIMITS.newsletterPerIp);
      await subscribe(prisma, { email: values.email, consent: field(form, "consent") === "yes", market: market.code, ipAddress: ip });
      await runSoon("email-deliver").catch(() => undefined);
      return "Check your inbox to confirm.";
    }, values);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've signed up several times already. Try again in an hour.", values };
    throw e;
  }
}

export async function confirmAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await confirmSubscription(prisma, field(form, "token"));
    return "You're subscribed. The next insights email arrives at the start of the month.";
  });
}

export async function unsubscribeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await unsubscribe(prisma, field(form, "token"));
    return "You're unsubscribed. We won't send you the insights email again.";
  });
}
