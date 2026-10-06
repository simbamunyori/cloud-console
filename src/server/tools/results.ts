import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { featureOn } from "@/server/features/features";
import type { EmailCheckResult } from "@/server/leads/sequences";
import { scoreFacts } from "@/server/security/score-facts";
import { fullScore, scoreChecks } from "@/server/security/score";
import type { Check, EmailReport } from "./email-check";

/**
 * What the free tools leave behind (docs/STRATEGY_ROLLOUT.md, U9): a
 * report a visitor chose to share, and the head start a new customer's
 * security score gets from the check they emailed themselves. Both behind
 * "Free tool results" in Features.
 */

export const SHARE_CONSENT = "Make a link anyone can open for 90 days, showing this report for my domain. Anyone I send it to can see it; nothing else about me is shown.";
export const SHARE_DAYS = 90;
const FEATURE = "free-tool-results";

export const resultsOn = (db: Pick<PrismaClient, "featureSwitch">) => featureOn(db, FEATURE);

/** Saves an email check report behind a link, with the visitor's consent. */
export async function shareEmailReport(db: PrismaClient, report: EmailReport, consent: boolean, now = new Date()) {
  if (!(await resultsOn(db))) throw new Error("Sharing isn't on.");
  if (!consent) return null;
  const token = randomBytes(18).toString("base64url");
  const result: EmailCheckResult = { domain: report.domain, score: report.score, checks: report.checks };
  await db.sharedResult.create({ data: { token, tool: "email-check", subject: report.domain, result: result as unknown as Prisma.InputJsonValue, consentText: SHARE_CONSENT, consentAt: now, expiresAt: new Date(now.getTime() + SHARE_DAYS * 86_400_000) } });
  return token;
}

/** A shared report, counted as a view, or null when it has gone. */
export async function sharedEmailReport(db: PrismaClient, token: string, now = new Date()) {
  if (!token || !(await resultsOn(db))) return null;
  const row = await db.sharedResult.findUnique({ where: { token } });
  if (!row || row.tool !== "email-check" || row.expiresAt <= now) return null;
  await db.sharedResult.update({ where: { token }, data: { views: { increment: 1 } } });
  return { ...(row.result as unknown as EmailCheckResult), checkedAt: row.consentAt, expiresAt: row.expiresAt };
}

export async function purgeSharedResults(db: Pick<PrismaClient, "sharedResult">, now = new Date()) {
  return (await db.sharedResult.deleteMany({ where: { expiresAt: { lte: now } } })).count;
}

/**
 * At sign-up: the email check this person emailed themselves becomes the
 * first email report in their security score, for the same domain, until
 * the nightly check runs it again.
 */
export async function startScoreFromFreeCheck(db: PrismaClient, organisationId: string, email: string, now = new Date()) {
  if (!(await resultsOn(db))) return null;
  const existing = await db.securityProfile.findUnique({ where: { organisationId } });
  if (existing?.emailReport) return null;
  const lead = await db.lead.findFirst({ where: { email: email.trim().toLowerCase(), tool: "email-check" }, orderBy: { updatedAt: "desc" } });
  const result = lead?.toolResult as unknown as EmailCheckResult | null;
  if (!lead || !result?.domain || !Array.isArray(result.checks)) return null;
  const report: EmailReport = { domain: result.domain, provider: null, checks: result.checks as Check[], score: result.score, checkedAt: lead.updatedAt.toISOString() };
  const checks = scoreChecks(await scoreFacts(db, organisationId, { services: [], emailDomain: report.domain, email: report, now }));
  const score = fullScore(checks);
  const data = {
    emailDomain: report.domain,
    emailReport: report as unknown as Prisma.InputJsonValue,
    emailCheckedAt: lead.updatedAt,
    score,
    checks: checks as unknown as Prisma.InputJsonValue,
    scoredAt: now,
    startedFrom: `email-check:${lead.reference}`,
  };
  await db.securityProfile.upsert({ where: { organisationId }, create: { organisationId, ...data }, update: data });
  return { domain: report.domain, score };
}
