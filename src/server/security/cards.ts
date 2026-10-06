import type { PrismaClient } from "@prisma/client";
import { formatMoment } from "@/lib/dates";
import type { TenantDb } from "@/server/db";
import type { Actor } from "@/server/org/access";
import { recoveryCodesLeft, twoStepCoverage } from "@/server/org/security";
import { featureOn } from "@/server/features/features";
import { SCORE_WORD } from "./score";

/**
 * The summary cards at the top of the Security page. Each source returns
 * a card, or null when it has nothing to say for this organisation. Later
 * phases add sources here (security score, protected devices, open
 * alerts, backup and local data copy status, compliance documents) without
 * changing the page.
 */

export interface SecurityCard {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "warning" | "negative";
  href?: string;
}

export interface SecurityContext {
  prisma: PrismaClient;
  db: TenantDb;
  actor: Actor;
  user: { totpEnabledAt: Date | null };
  timeZone: string;
}

type CardSource = (ctx: SecurityContext) => Promise<SecurityCard | null>;

const twoStepTeam: CardSource = async ({ db }) => {
  const c = await twoStepCoverage(db);
  const all = c.on === c.total;
  return { key: "two-step-team", label: "Two-step login", value: `${c.on} of ${c.total}`, detail: all ? "Everyone in your team uses it." : "Some people are still setting it up.", tone: all ? "positive" : "warning" };
};

const backupCodes: CardSource = async ({ prisma, actor }) => {
  const left = await recoveryCodesLeft(prisma, actor.userId);
  return { key: "backup-codes", label: "Your backup codes", value: `${left} left`, detail: left <= 2 ? "Running low. Make new ones below." : "Each works once if you lose your phone.", tone: left <= 2 ? "warning" : undefined };
};

const twoStepYou: CardSource = async ({ user, timeZone }) => ({
  key: "two-step-you",
  label: "Two-step login for you",
  value: "On",
  detail: user.totpEnabledAt ? `Since ${formatMoment(user.totpEnabledAt, timeZone)}` : "Required for every account.",
  tone: "positive",
});

/** The full security score (STRATEGY_ROLLOUT U4), once it is on. */
const fullScore: CardSource = async ({ prisma, db }) => {
  if (!(await featureOn(prisma, "security-score"))) return null;
  const profile = await db.securityProfile.findFirst({ select: { score: true } });
  const score = profile?.score;
  return {
    key: "security-score",
    label: "Security score",
    value: score == null ? "Not checked yet" : `${score} / 100`,
    detail: score == null ? "See your score and what to fix." : `${SCORE_WORD(score)}. See every check and its fix.`,
    tone: score == null ? undefined : score >= 80 ? "positive" : score >= 50 ? "warning" : "negative",
    href: "/app/security/score",
  };
};

export const CARD_SOURCES: CardSource[] = [fullScore, twoStepTeam, twoStepYou, backupCodes];

export async function securityCards(ctx: SecurityContext): Promise<SecurityCard[]> {
  const cards = await Promise.all(CARD_SOURCES.map((source) => source(ctx)));
  return cards.filter((c): c is SecurityCard => c !== null);
}
