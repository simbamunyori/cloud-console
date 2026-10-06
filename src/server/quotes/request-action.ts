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
import { connectivityOffered, describeConnectRequest, parseConnectRequest } from "@/server/connectivity/connectivity";
import { requestQuote } from "./quotes";

/** What someone asking for a quote agrees to: we contact them about it. */
export const QUOTE_LEAD_CONSENT = "Fourth Generation Technologies may contact me about this request by email or phone, as the Privacy Notice explains.";

const FIELDS = ["name", "company", "email", "phone", "country", "need"] as const;
const CONNECT_FIELDS = ["sites", "speed", "startBy", "standby", "cloudLink", "managed"] as const;

/**
 * Takes a quote request from a form, with the spam checks both forms
 * share: the hidden "website" field and a limit per network address.
 */
export async function takeQuoteRequest(form: FormData, where: { market: string; organisationId?: string; userId?: string }): Promise<QuoteRequestState> {
  // STRATEGY_ROLLOUT U12: the connectivity questions count only where connectivity is offered.
  const asksConnect = field(form, "connect") === "1" && (await connectivityOffered(prisma, where.market));
  const values = Object.fromEntries([...FIELDS, ...(asksConnect ? CONNECT_FIELDS : [])].map((k) => [k, field(form, k)]));
  // A bot filled in the field people can't see: look as if it worked, keep nothing.
  if (field(form, "website")) return { reference: "QUO-RECEIVED" };
  try {
    const ip = (await requestContext()).ipAddress ?? "unknown";
    await enforce(prisma, `quotePerIp:${ip}`, LIMITS.quotePerIp);
    const connect = asksConnect
      ? parseConnectRequest({ sites: values.sites, speed: values.speed, startBy: values.startBy, standby: values.standby === "on", cloudLink: values.cloudLink === "on", managed: values.managed === "on" })
      : undefined;
    const need = connect ? [describeConnectRequest(connect), values.need.trim()].filter(Boolean).join("\n\n").slice(0, 2000) : values.need;
    const quote = await requestQuote(prisma, { ...(values as Record<(typeof FIELDS)[number], string>), need, product: field(form, "product") || undefined, referral: field(form, "referral") || undefined, connect }, where);
    await countForCampaign("QUOTE", quote.reference);
    // From the public site, the request is also a lead (Milestone 8); customers' requests stay in the Quotes queue.
    if (!where.organisationId) {
      const touch = await currentTouch();
      await prisma
        .$transaction((tx) =>
          captureLead(tx, {
            market: where.market,
            source: "QUOTE",
            tool: field(form, "product") || (connect ? "connectivity" : null),
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
