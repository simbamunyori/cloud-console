import "server-only";
import type { QuoteRequestState } from "@/components/quotes/request-form";
import { field } from "@/server/action-state";
import { requestContext } from "@/server/auth/next";
import { countForCampaign } from "@/server/campaigns/cookie";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { DomainError } from "@/server/org/access";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { requestQuote } from "./quotes";

const FIELDS = ["name", "company", "email", "phone", "country", "need"] as const;

/**
 * Takes a quote request from a form, with the spam checks both forms
 * share: the hidden "website" field and a limit per network address.
 */
export async function takeQuoteRequest(form: FormData, where: { market: string; organisationId?: string; userId?: string }): Promise<QuoteRequestState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, field(form, k)]));
  // A bot filled in the field people can't see: look as if it worked, keep nothing.
  if (field(form, "website")) return { reference: "QUO-RECEIVED" };
  try {
    const ip = (await requestContext()).ipAddress ?? "unknown";
    await enforce(prisma, `quotePerIp:${ip}`, LIMITS.quotePerIp);
    const quote = await requestQuote(prisma, { ...(values as Record<(typeof FIELDS)[number], string>), product: field(form, "product") || undefined }, where);
    await countForCampaign("QUOTE", quote.reference);
    await runSoon("email-deliver").catch(() => undefined);
    return { reference: quote.reference };
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've sent several requests already. Try again in an hour, or email us.", values };
    if (e instanceof DomainError) return { error: e.fieldErrors ? undefined : e.message, fieldErrors: e.fieldErrors ?? (e.field ? { [e.field]: e.message } : undefined), values };
    throw e;
  }
}
