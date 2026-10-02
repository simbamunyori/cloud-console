import "server-only";
import type { QuoteRequestState } from "@/components/quotes/request-form";
import { field } from "@/server/action-state";
import { requestContext } from "@/server/auth/next";
import { countForCampaign, currentTouch } from "@/server/campaigns/cookie";
import { captureLead } from "@/server/leads/capture";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { DomainError } from "@/server/org/access";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { requestQuote } from "./quotes";

/** What someone asking for a quote agrees to: we contact them about it. */
export const QUOTE_LEAD_CONSENT = "Fourth Generation Technologies may contact me about this request by email or phone, as the Privacy Notice explains.";

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
    const quote = await requestQuote(prisma, { ...(values as Record<(typeof FIELDS)[number], string>), product: field(form, "product") || undefined, referral: field(form, "referral") || undefined }, where);
    await countForCampaign("QUOTE", quote.reference);
    // From the public site, the request is also a lead (Milestone 8); customers' requests stay in the Quotes queue.
    if (!where.organisationId) {
      const touch = await currentTouch();
      await prisma
        .$transaction((tx) =>
          captureLead(tx, {
            market: where.market,
            source: "QUOTE",
            tool: field(form, "product") || null,
            name: values.name,
            email: values.email,
            phone: values.phone,
            company: values.company,
            need: `Quote ${quote.reference}: ${values.need}`,
            consentText: QUOTE_LEAD_CONSENT,
            followUps: true,
            touch,
          }),
        )
        .catch((e) => console.error("Lead not recorded for quote:", e instanceof Error ? e.message : e));
    }
    await runSoon("email-deliver").catch(() => undefined);
    return { reference: quote.reference };
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've sent several requests already. Try again in an hour, or email us.", values };
    if (e instanceof DomainError) return { error: e.fieldErrors ? undefined : e.message, fieldErrors: e.fieldErrors ?? (e.field ? { [e.field]: e.message } : undefined), values };
    throw e;
  }
}
