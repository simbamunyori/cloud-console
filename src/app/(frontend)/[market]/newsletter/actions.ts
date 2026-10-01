"use server";

import { field, run, type ActionState } from "@/server/action-state";
import { requestContext } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { currentTouch } from "@/server/campaigns/cookie";
import { captureLead } from "@/server/leads/capture";
import { confirmSubscription, NEWSLETTER_CONSENT, subscribe, unsubscribe } from "@/server/newsletter/newsletter";
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
    const email = await confirmSubscription(prisma, field(form, "token"));
    // A confirmed sign-up is a lead too (Milestone 8), with one welcome email of free tools.
    const sub = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (sub) {
      const touch = await currentTouch();
      await prisma
        .$transaction((tx) =>
          captureLead(tx, {
            market: sub.marketCode,
            source: "NEWSLETTER",
            tool: "newsletter",
            email,
            need: "Signed up for the monthly insights email.",
            consentText: NEWSLETTER_CONSENT,
            followUps: true,
            touch,
          }),
        )
        .then(() => runSoon("email-deliver"))
        .catch((e) => console.error("Lead not recorded for newsletter sign-up:", e instanceof Error ? e.message : e));
    }
    return "You're subscribed. The next insights email arrives at the start of the month.";
  });
}

export async function unsubscribeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await unsubscribe(prisma, field(form, "token"));
    return "You're unsubscribed. We won't send you the insights email again.";
  });
}
