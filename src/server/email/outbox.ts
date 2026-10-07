import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "@/server/env";
import type { EmailAdapter } from "./adapter";
import { emailBrand, renderEmail, type EmailBrand } from "./layout";
import { TEMPLATES } from "./templates";

/**
 * How dates and amounts are written in an email: the organisation's
 * market, or for account emails the recipient's first organisation, or
 * the default market for someone with none yet.
 */
async function emailRegion(db: PrismaClient, row: { organisationId: string | null; toAddress: string }) {
  const org = row.organisationId
    ? await db.organisation.findUnique({ where: { id: row.organisationId }, select: { locale: true, timeZone: true } })
    : (
        await db.membership.findFirst({
          where: { active: true, user: { email: row.toAddress.toLowerCase() } },
          orderBy: { createdAt: "asc" },
          select: { organisation: { select: { locale: true, timeZone: true } } },
        })
      )?.organisation;
  if (org) return org;
  const market = await db.market.findFirst({ where: { isDefault: true }, select: { locale: true, timeZone: true } });
  return market ?? { locale: "en-BW", timeZone: "Africa/Gaborone" };
}

type OutboxClient = { outboundEmail: { create: (args: { data: Prisma.OutboundEmailUncheckedCreateInput }) => Promise<unknown> } };

/**
 * Queues an email in the same transaction as the change that caused it,
 * so it goes if and only if the change happened.
 */
export async function queueEmail(
  tx: OutboxClient,
  input: { organisationId?: string | null; to: string; kind: string; payload: Prisma.InputJsonValue },
) {
  if (!TEMPLATES[input.kind]) throw new Error(`No email template called ${input.kind}.`);
  await tx.outboundEmail.create({
    data: { organisationId: input.organisationId ?? null, toAddress: input.to, kind: input.kind, payload: input.payload },
  });
}

const MAX_ATTEMPTS = 6;
/** 1, 2, 4, 8, 16 minutes between tries. */
const backoffMs = (attempt: number) => 60_000 * 2 ** Math.max(0, attempt - 1);

/**
 * Sends what is due. Each row is claimed with a conditional update first,
 * so two workers never send the same email twice.
 */
export async function deliverDue(
  db: PrismaClient,
  adapter: EmailAdapter,
  now = new Date(),
  limit = 50,
  /** Narrows what is sent; tests use it so parallel suites don't take each other's rows. */
  only: Prisma.OutboundEmailWhereInput = {},
): Promise<number> {
  const due = await db.outboundEmail.findMany({
    where: { ...only, status: "QUEUED", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const e = env();
  let sent = 0;
  let brand: EmailBrand | undefined;
  for (const row of due) {
    const claim = await db.outboundEmail.updateMany({
      where: { id: row.id, status: "QUEUED", attempts: row.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + backoffMs(row.attempts + 1)) },
    });
    if (claim.count !== 1) continue;
    try {
      const rendered = await TEMPLATES[row.kind]?.(row.payload as Record<string, unknown>, {
        db,
        appUrl: e.APP_URL,
        siteUrl: (e.SITE_URL ?? e.APP_URL).replace(/\/$/, ""),
        consoleName: e.CONSOLE_NAME,
        now,
        ...(await emailRegion(db, row)),
      });
      if (!rendered) {
        // Nothing to send any more, e.g. the invitation was withdrawn.
        await db.outboundEmail.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "No longer needed." } });
        continue;
      }
      brand ??= await emailBrand(db, e.APP_URL);
      const { text, html } = renderEmail(rendered.body, e.APP_URL, brand);
      await adapter.send({
        to: row.toAddress,
        subject: rendered.subject,
        text,
        html,
        ...(rendered.headers ? { headers: rendered.headers } : {}),
        ...(rendered.calendar ? { calendar: rendered.calendar } : {}),
        ...(rendered.attachments?.length ? { attachments: rendered.attachments } : {}),
      });
      await db.outboundEmail.update({ where: { id: row.id }, data: { status: "SENT", sentAt: now, subject: rendered.subject, lastError: null } });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
      await db.outboundEmail.update({
        where: { id: row.id },
        data: { lastError: message, status: row.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "QUEUED" },
      });
    }
  }
  return sent;
}
