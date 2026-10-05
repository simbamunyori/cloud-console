import { Prisma, type PrismaClient } from "@prisma/client";
import { queueEmail } from "@/server/email/outbox";

/**
 * Emails to Admins about exchange rates and the monthly price book. Each
 * alert has a key, and a key is only ever sent once, so a fetch that
 * fails at every try in a day sends one email, not four.
 */

export interface AlertContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  /** Where the button goes, a path in the staff console. Defaults to /admin/pricing. */
  href?: string;
}

type Db = Pick<PrismaClient, "$transaction" | "user" | "market">;

/** Who hears about pricing: every Admin, since only they can change it. */
export async function pricingRecipients(db: Pick<PrismaClient, "user" | "market">): Promise<string[]> {
  const admins = await db.user.findMany({ where: { kind: "STAFF", staffRole: "ADMIN", deactivatedAt: null }, select: { email: true }, orderBy: { createdAt: "asc" } });
  if (admins.length) return admins.map((a) => a.email);
  const market = await db.market.findFirst({ where: { isDefault: true }, select: { supportEmail: true } });
  return market ? [market.supportEmail] : [];
}

type Tx = Prisma.TransactionClient;

/** Queues an email of a kind to every Admin, inside a transaction already open. */
export async function emailAdmins(tx: Tx, kind: string, payload: Prisma.InputJsonValue) {
  for (const to of await pricingRecipients(tx)) await queueEmail(tx, { to, kind, payload });
}

/** Sends an alert unless one with the same key went before. Returns whether it was sent. */
export async function sendAlert(db: Db, key: string, content: AlertContent): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      await tx.pricingAlert.create({ data: { key } });
      await emailAdmins(tx, "pricing.alert", { ...content } as unknown as Prisma.InputJsonValue);
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

/** 250 as "2.5". */
export const bpsText = (bps: number) => (bps / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 });
