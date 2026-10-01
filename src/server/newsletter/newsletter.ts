import type { PrismaClient } from "@prisma/client";
import { hashToken, newToken } from "@/server/auth/tokens";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";

/**
 * The monthly insights email: sign-up with consent and double opt-in.
 * A sign-up sends a confirmation email; only a confirmed, subscribed
 * address is ever sent the newsletter. Every newsletter carries a
 * one-click unsubscribe link that works for good.
 */

/** The words the visitor agreed to, stored with the sign-up. */
export const NEWSLETTER_CONSENT = "Send me the monthly insights email. I can unsubscribe at any time.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** No second confirmation email to the same address within this time. */
const RESEND_AFTER_MS = 10 * 60_000;

type NewsletterDb = Pick<PrismaClient, "newsletterSubscriber" | "outboundEmail" | "$transaction">;

/**
 * Takes a sign-up. Always answers the same way, whether the address is
 * new, waiting for confirmation or already subscribed, so the form never
 * reveals who is on the list.
 */
export async function subscribe(db: NewsletterDb, input: { email: string; consent: boolean; market: string; ipAddress?: string | null }, now = new Date()) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw new DomainError("invalid", "Enter your email address, e.g. you@company.co.bw.", "email");
  if (!input.consent) throw new DomainError("invalid", "Tick the box to say you want the email.", "consent");
  await db.$transaction(async (tx) => {
    const found = await tx.newsletterSubscriber.findUnique({ where: { email } });
    if (found?.confirmedAt && !found.unsubscribedAt) return;
    if (found?.confirmSentAt && now.getTime() - found.confirmSentAt.getTime() < RESEND_AFTER_MS) return;
    const consent = { consentText: NEWSLETTER_CONSENT, consentAt: now, ipAddress: input.ipAddress ?? null, marketCode: input.market, confirmSentAt: now };
    const row = found
      ? await tx.newsletterSubscriber.update({ where: { id: found.id }, data: { ...consent, confirmedAt: null, unsubscribedAt: null } })
      : await tx.newsletterSubscriber.create({ data: { email, ...consent, unsubscribeToken: newToken() } });
    await queueEmail(tx, { to: email, kind: "newsletter.confirm", payload: { subscriberId: row.id } });
  });
}

/** Makes the link for the confirmation email, keeping only its hash. Null when it no longer applies. */
export async function newConfirmLink(db: Pick<PrismaClient, "newsletterSubscriber">, subscriberId: string, appUrl: string) {
  const row = await db.newsletterSubscriber.findUnique({ where: { id: subscriberId } });
  if (!row || row.confirmedAt || row.unsubscribedAt) return null;
  const token = newToken();
  await db.newsletterSubscriber.update({ where: { id: row.id }, data: { confirmTokenHash: hashToken(token) } });
  return { url: `${appUrl}/${row.marketCode}/newsletter/confirm/${encodeURIComponent(token)}`, unsubscribe: unsubscribeUrl(appUrl, row) };
}

export const unsubscribeUrl = (appUrl: string, row: { marketCode: string; unsubscribeToken: string }) => `${appUrl}/${row.marketCode}/newsletter/unsubscribe/${encodeURIComponent(row.unsubscribeToken)}`;

/** Confirms a sign-up from the emailed link. Links work for 7 days. */
export async function confirmSubscription(db: Pick<PrismaClient, "newsletterSubscriber">, token: string, now = new Date()) {
  const row = await db.newsletterSubscriber.findUnique({ where: { confirmTokenHash: hashToken(token) } });
  if (!row || row.unsubscribedAt || !row.confirmSentAt || now.getTime() - row.confirmSentAt.getTime() > 7 * 86_400_000) {
    throw new DomainError("not-found", "This link has expired. Sign up again at the bottom of any page and we'll send a new one.");
  }
  await db.newsletterSubscriber.update({ where: { id: row.id }, data: { confirmedAt: now, confirmTokenHash: null } });
  return row.email;
}

/** Unsubscribes for good. Safe to use twice. */
export async function unsubscribe(db: Pick<PrismaClient, "newsletterSubscriber">, token: string, now = new Date()) {
  const row = await db.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!row) throw new DomainError("not-found", "We couldn't find that subscription. It may have been removed already.");
  if (!row.unsubscribedAt) await db.newsletterSubscriber.update({ where: { id: row.id }, data: { unsubscribedAt: now, confirmTokenHash: null } });
  return row.email;
}

/** Who receives the monthly email: confirmed and not unsubscribed. */
export function activeSubscribers(db: Pick<PrismaClient, "newsletterSubscriber">, market?: string) {
  return db.newsletterSubscriber.findMany({ where: { confirmedAt: { not: null }, unsubscribedAt: null, ...(market ? { marketCode: market } : {}) }, orderBy: { confirmedAt: "asc" } });
}
