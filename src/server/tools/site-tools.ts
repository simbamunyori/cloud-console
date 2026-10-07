import "server-only";
import { company } from "@/config/app";
import { requestContext } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { sitePrices } from "@/server/site/site";
import { shownInclusionsBySlug } from "@/server/catalogue/inclusions";
import { PLANS } from "./calculator";
import { checkEmailSecurity, cleanDomain, type EmailReport } from "./email-check";
import { emailCheckLookup } from "./lookup";

/** What someone agrees to when a free tool emails them its result. */
export const TOOL_CONSENT = `Email me this and a few follow-up emails about it. I can unsubscribe at any time, and ${company.name} keeps my details for 12 months.`;

/** Runs the email security check for a visitor, within the per-address limit. */
export async function runEmailCheck(input: string): Promise<EmailReport> {
  const domain = cleanDomain(input);
  if (!domain) throw new DomainError("invalid", "Enter a domain name, like yourcompany.co.bw.", "domain");
  const ip = (await requestContext()).ipAddress ?? "unknown";
  try {
    await enforce(prisma, `emailCheckPerIp:${ip}`, LIMITS.emailCheckPerIp);
  } catch (e) {
    if (e instanceof RateLimitedError) throw new DomainError("unavailable", "You've run a lot of checks from this network. Try again in a few minutes.", "domain");
    throw e;
  }
  return checkEmailSecurity(domain, emailCheckLookup());
}

/** The Microsoft 365 and Google Workspace plans on sale in a market, at the prices it shows. */
export async function calculatorPrices(code: string) {
  const slugs = new Set(PLANS.map((p) => p.slug));
  const prices = (await sitePrices(code)).filter((p) => slugs.has(p.slug));
  // STRATEGY_ROLLOUT U3: what each plan includes at no extra charge, once that feature is on.
  const included = await shownInclusionsBySlug(prisma, prices.map((p) => p.slug));
  return prices.map((p) => ({ ...p, included: included.get(p.slug) ?? [] }));
}
