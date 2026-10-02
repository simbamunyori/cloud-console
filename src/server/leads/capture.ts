import type { Lead, LeadSource, Prisma, PrismaClient } from "@prisma/client";
import type { Touch } from "@/server/campaigns/campaigns";
import { newToken } from "@/server/auth/tokens";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { newReference } from "@/server/orders/orders";
import { SEQUENCES } from "./sequences";

/**
 * One way in for every lead (final build, Milestone 8): Thapelo, the free
 * tools, quote requests, newsletter sign-ups and booked calls. Someone who
 * comes back is the same lead, updated, with each visit kept as a touch:
 * where it came from, the tool used and the campaign tags.
 */

/** Leads, and the chat that came with them, are deleted this long after they last changed (Privacy Notice). */
export const LEAD_KEEP_MONTHS = 12;

export const keepUntil = (now: Date) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + LEAD_KEEP_MONTHS);
  return d;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface CaptureInput {
  market: string;
  source: LeadSource;
  /** The free tool, e.g. "email-check". */
  tool?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  company?: string | null;
  /** What they're after, in a sentence for staff. */
  need: string;
  /** The words they agreed to. */
  consentText: string;
  /** Start this source's follow-up emails. Only with consent to them. */
  followUps: boolean;
  touch?: Touch | null;
  toolResult?: Prisma.InputJsonValue;
  /** Thapelo's chat, which keys the lead when there is one. */
  chatId?: string | null;
}

type Tx = Prisma.TransactionClient;

/** Checks the details every lead form asks for. Throws a DomainError with field errors. */
export function checkContact(input: { name?: string; email: string; consent: boolean }, o: { nameRequired?: boolean } = {}) {
  const fieldErrors: Record<string, string> = {};
  if (o.nameRequired && !input.name?.trim()) fieldErrors.name = "Enter your name.";
  if (!EMAIL.test(input.email.trim()) || input.email.length > 200) fieldErrors.email = "Enter an email address like name@company.com.";
  if (!input.consent) fieldErrors.consent = "Tick the box so we may email you.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the form.", undefined, fieldErrors);
}

/**
 * Creates the lead, or updates the open one for the same chat or email in
 * the market. Runs inside the caller's transaction, so the first email of
 * the sequence is queued if and only if the lead is saved.
 */
export async function captureLead(tx: Tx, input: CaptureInput, now = new Date()): Promise<Lead> {
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const name = input.name?.trim().slice(0, 100) || null;
  const phone = input.phone?.trim().slice(0, 40) || null;
  const company = input.company?.trim().slice(0, 120) || null;
  const need = input.need.trim().slice(0, 2000);
  const touch = input.touch ?? null;
  const purgeAfter = keepUntil(now);

  // A chat keeps its own lead, so staff read each conversation; otherwise the open lead for the address.
  const existing =
    (input.chatId ? await tx.lead.findUnique({ where: { chatId: input.chatId } }) : null) ??
    (await tx.lead.findFirst({ where: { market: input.market, email, status: { not: "CLOSED" }, ...(input.chatId ? { chatId: null } : {}) }, orderBy: { createdAt: "desc" } }));

  const sequence = input.followUps ? SEQUENCES[input.source] : undefined;
  // A buyer, or a lead staff stopped, never restarts; one that finished or unsubscribed restarts with fresh consent.
  const restart = sequence && (!existing || !["bought", "staff"].includes(existing.followUpStopped ?? "")) && (!existing?.followUp || existing.followUpStoppedAt || existing.followUp !== input.source);
  const followUp: { followUp?: LeadSource; followUpStep?: number; followUpAt?: Date; followUpStoppedAt?: null; followUpStopped?: null } = restart
    ? { followUp: input.source, followUpStep: 0, followUpAt: new Date(now.getTime() + sequence[0].afterDays * 86_400_000), followUpStoppedAt: null, followUpStopped: null }
    : {};

  const campaign = touch ? { campaign: touch.campaign, campaignSource: touch.source, campaignMedium: touch.medium } : {};
  const common = {
    email,
    ...(phone ? { phone } : {}),
    ...(company ? { company } : {}),
    source: input.source,
    tool: input.tool ?? null,
    consentText: input.consentText,
    consentAt: now,
    purgeAfter,
    ...(input.toolResult !== undefined ? { toolResult: input.toolResult } : {}),
    ...campaign,
  };
  const lead = existing
    ? await tx.lead.update({
        where: { id: existing.id },
        data: {
          ...common,
          ...(name ? { name } : {}),
          // Keep what they said before: staff read the newest first.
          need: existing.need && existing.need !== need ? `${need}\n\nEarlier: ${existing.need}`.slice(0, 4000) : need,
          status: existing.status === "CONTACTED" ? "CONTACTED" : "NEW",
          ...(input.chatId && !existing.chatId ? { chatId: input.chatId } : {}),
          ...(existing.unsubscribeToken ? {} : { unsubscribeToken: newToken() }),
          ...followUp,
        },
      })
    : await tx.lead.create({
        data: {
          ...common,
          reference: newReference("LEAD"),
          market: input.market,
          name: name ?? email,
          need,
          chatId: input.chatId ?? null,
          unsubscribeToken: newToken(),
          ...followUp,
        },
      });
  await tx.leadTouch.create({ data: { leadId: lead.id, source: input.source, tool: input.tool ?? null, summary: need.slice(0, 300), ...campaign } });

  // The first email of a sequence goes now; it carries what the tool found.
  if (restart && sequence?.[0]?.afterDays === 0) {
    await sendStep(tx, lead, 0, now);
    return tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
  }
  return lead;
}

/** Queues one follow-up email and moves the lead on to the next step, or ends the sequence. */
export async function sendStep(tx: Pick<Tx, "lead" | "outboundEmail">, lead: Pick<Lead, "id" | "email" | "followUp">, step: number, now: Date) {
  const steps = SEQUENCES[lead.followUp as LeadSource] ?? [];
  if (!steps[step]) return;
  await queueEmail(tx, { to: lead.email, kind: "lead.follow-up", payload: { leadId: lead.id, sequence: lead.followUp, step } });
  const next = steps[step + 1];
  await tx.lead.update({
    where: { id: lead.id },
    data: next
      ? { followUpStep: step + 1, followUpAt: new Date(now.getTime() + (next.afterDays - steps[step].afterDays) * 86_400_000) }
      : { followUpStep: step + 1, followUpAt: null, followUpStoppedAt: now, followUpStopped: "finished" },
  });
}

/** Whether someone with this email has ordered anything: their follow-ups stop. */
export async function hasBought(db: Pick<PrismaClient, "order">, email: string) {
  const n = await db.order.count({
    where: { status: { in: ["SETTING_UP", "ACTIVE"] }, organisation: { memberships: { some: { active: true, user: { email: email.toLowerCase() } } } } },
  });
  return n > 0;
}

/**
 * The follow-up job: sends each due step, unless they bought something
 * meanwhile. Each lead is claimed by its step first, so two workers never
 * send the same email.
 */
export async function sendFollowUps(db: PrismaClient, now = new Date(), only: Prisma.LeadWhereInput = {}) {
  const due = await db.lead.findMany({ where: { ...only, followUp: { not: null }, followUpStoppedAt: null, followUpAt: { lte: now } }, take: 100, orderBy: { followUpAt: "asc" } });
  let sent = 0;
  for (const lead of due) {
    if (await hasBought(db, lead.email)) {
      await db.lead.updateMany({ where: { email: lead.email, followUpStoppedAt: null }, data: { followUpAt: null, followUpStoppedAt: now, followUpStopped: "bought" } });
      continue;
    }
    const ok = await db.$transaction(async (tx) => {
      const claim = await tx.lead.updateMany({ where: { id: lead.id, followUpStep: lead.followUpStep, followUpStoppedAt: null }, data: { followUpAt: null } });
      if (claim.count !== 1) return false;
      await sendStep(tx, lead, lead.followUpStep, now);
      return true;
    });
    if (ok) sent++;
  }
  return sent;
}

/** One click in any follow-up email: stops every sequence for that address. Safe to use twice. */
export async function unsubscribeLead(db: Pick<PrismaClient, "lead">, token: string, now = new Date()) {
  const lead = await db.lead.findUnique({ where: { unsubscribeToken: token } });
  if (!lead) throw new DomainError("not-found", "We couldn't find those emails. They may have stopped already.");
  await db.lead.updateMany({ where: { email: lead.email, followUpStoppedAt: null }, data: { followUpAt: null, followUpStoppedAt: now, followUpStopped: "unsubscribed" } });
  return lead.email;
}

export const unsubscribeLeadUrl = (appUrl: string, lead: { market: string; unsubscribeToken: string | null }) =>
  lead.unsubscribeToken ? `${appUrl}/${lead.market}/unsubscribe/${encodeURIComponent(lead.unsubscribeToken)}` : null;

export const STOPPED_WORDS: Record<string, string> = {
  bought: "They ordered, so the emails stopped.",
  unsubscribed: "They unsubscribed.",
  finished: "Every email in the sequence was sent.",
  staff: "Stopped by staff.",
  booked: "They booked a call with an engineer.",
};
