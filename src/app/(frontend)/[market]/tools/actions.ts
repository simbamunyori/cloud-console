"use server";

import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/domain/money";
import { field, run, type ActionState } from "@/server/action-state";
import { requestContext } from "@/server/auth/next";
import { countForCampaign, currentTouch } from "@/server/campaigns/cookie";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { captureLead, checkContact } from "@/server/leads/capture";
import type { CalculatorResult, EmailCheckResult, ReadinessResult } from "@/server/leads/sequences";
import { DomainError } from "@/server/org/access";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { siteMarket } from "@/server/site/site";
import { estimate, parseNeeds, parseUsers, PROVIDER_LABEL, type Provider } from "@/server/tools/calculator";
import { nextSteps, parseAnswers } from "@/server/tools/readiness";
import { readinessByToken, saveReadiness } from "@/server/tools/readiness-store";
import { shareEmailReport } from "@/server/tools/results";
import { calculatorPrices, runEmailCheck, TOOL_CONSENT } from "@/server/tools/site-tools";

/**
 * The free tools' forms (final build, Milestone 8). A result is free
 * without any details; "Email me this" takes an address with consent,
 * creates or updates the lead and starts that tool's follow-up emails.
 */

async function limited(kind: "toolPerIp") {
  const ip = (await requestContext()).ipAddress ?? "unknown";
  await enforce(prisma, `${kind}:${ip}`, LIMITS[kind]);
}

async function takeLead(
  form: FormData,
  build: (
    market: Awaited<ReturnType<typeof siteMarket>>,
  ) => Promise<{ source: "EMAIL_CHECK" | "COST_CALCULATOR" | "DPA_CHECKLIST"; tool: string; need: string; result: object; after?: (leadId: string) => Promise<void> }>,
) {
  const values = { name: field(form, "name"), email: field(form, "email") };
  if (field(form, "website")) return { ok: true, message: "Check your inbox." } satisfies ActionState;
  try {
    return await run(async () => {
      const market = await siteMarket(field(form, "market"));
      checkContact({ email: values.email, consent: field(form, "consent") === "yes" });
      await limited("toolPerIp");
      const r = await build(market);
      const touch = await currentTouch();
      const lead = await prisma.$transaction((tx) =>
        captureLead(tx, {
          market: market.code,
          source: r.source,
          tool: r.tool,
          name: values.name,
          email: values.email,
          need: r.need,
          consentText: TOOL_CONSENT,
          followUps: true,
          touch,
          toolResult: r.result,
        }),
      );
      await r.after?.(lead.id);
      await countForCampaign("LEAD", lead.reference);
      await runSoon("email-deliver").catch(() => undefined);
      return `We've emailed it to ${values.email.trim().toLowerCase()}. A couple of short follow-up emails will come after it; each has a link to stop them.`;
    }, values);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've asked for several of these already. Try again in an hour.", values } satisfies ActionState;
    throw e;
  }
}

export async function emailReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return takeLead(form, async () => {
    const report = await runEmailCheck(field(form, "domain"));
    const result: EmailCheckResult = { domain: report.domain, score: report.score, checks: report.checks };
    return { source: "EMAIL_CHECK", tool: "email-check", need: `Email security check for ${report.domain}: ${report.score} out of 100.`, result };
  });
}

export async function emailEstimateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return takeLead(form, async (m) => {
    const users = parseUsers(field(form, "users"));
    if (!users) throw new DomainError("invalid", "Work out an estimate first.");
    const provider = (["microsoft", "google", "either"].includes(field(form, "provider")) ? field(form, "provider") : "either") as Provider;
    const est = estimate({ users, provider, needs: parseNeeds(form.getAll("need")) }, await calculatorPrices(m.code));
    if (!est.plan) throw new DomainError("invalid", est.note ?? "No plan fits. Ask us for a quote.");
    const view = (p: NonNullable<typeof est.plan>) => ({ slug: p.slug, name: p.name, unit: formatMoney(p.unit, m.locale), total: formatMoney(p.total, m.locale) });
    const result: CalculatorResult = { provider: PROVIDER_LABEL[provider], users, plan: view(est.plan), alternative: est.alternative ? view(est.alternative) : null };
    return { source: "COST_CALCULATOR", tool: "cost-calculator", need: `Cost calculator: ${est.plan.name} for ${users} ${users === 1 ? "person" : "people"}, ${result.plan.total} a month.`, result };
  });
}

/** The checklist itself: answers in, a saved result out, then its page. */
export async function readinessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const market = await siteMarket(field(form, "market"));
  const { answers, missing } = parseAnswers((k) => field(form, k));
  const values = Object.fromEntries(Object.entries(answers));
  if (missing.length)
    return {
      error: `Answer every question first. ${missing.length === 1 ? "One is" : `${missing.length} are`} still open.`,
      fieldErrors: Object.fromEntries(missing.map((k) => [k, "Choose an answer."])),
      values,
    };
  try {
    await limited("toolPerIp");
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've filled this in several times already. Try again in an hour.", values };
    throw e;
  }
  const row = await saveReadiness(prisma, market.code, answers);
  redirect(`/${market.code}/tools/data-protection/${encodeURIComponent(row.token)}`);
}

export async function emailReadinessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return takeLead(form, async (m) => {
    const row = await readinessByToken(prisma, field(form, "token"));
    if (!row) throw new DomainError("not-found", "That checklist has expired. Fill it in again.");
    const law = m.dataProtectionLaw ?? "data protection law";
    const steps = nextSteps(parseAnswers((k) => String((row.answers as Record<string, unknown>)[k] ?? "")).answers).map((s) => s.step);
    const result: ReadinessResult = { token: row.token, score: row.score, law, steps };
    return {
      source: "DPA_CHECKLIST",
      tool: "data-protection",
      need: `Data protection checklist: ${row.score} out of 100.`,
      result,
      after: async (leadId) => {
        await prisma.readinessCheck.update({ where: { id: row.id }, data: { leadId } });
      },
    };
  });
}

/** "Share this report" (U9): a link anyone can open for 90 days, only with the visitor's tick. */
export async function shareReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const market = field(form, "market");
  return run(async () => {
    if (field(form, "consent") !== "yes") throw new DomainError("invalid", "Tick the box to make the link.", "consent");
    await limited("toolPerIp");
    const token = await shareEmailReport(prisma, await runEmailCheck(field(form, "domain")), true);
    return `/${(await siteMarket(market)).code}/tools/email-security/shared/${token}`;
  }).catch((e) => {
    if (e instanceof RateLimitedError) return { error: "You've made several links already. Try again in an hour." } satisfies ActionState;
    throw e;
  });
}
