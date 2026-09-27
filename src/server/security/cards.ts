import type { PrismaClient } from "@prisma/client";
import { formatMoment } from "@/lib/dates";
import type { TenantDb } from "@/server/db";
import type { Actor } from "@/server/org/access";
import { recoveryCodesLeft, twoStepCoverage } from "@/server/org/security";

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

export const CARD_SOURCES: CardSource[] = [twoStepTeam, twoStepYou, backupCodes];

export async function securityCards(ctx: SecurityContext): Promise<SecurityCard[]> {
  const cards = await Promise.all(CARD_SOURCES.map((source) => source(ctx)));
  return cards.filter((c): c is SecurityCard => c !== null);
}
