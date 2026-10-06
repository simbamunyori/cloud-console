import { randomBytes } from "node:crypto";
import type { BusinessUnit, PrismaClient, Ticket, TicketPriority, TicketStatus } from "@prisma/client";
import type { TenantDb } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { featureOn } from "@/server/features/features";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { newReference } from "@/server/orders/orders";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { PRIORITIES, PRIORITY_LABEL, UNIT_KEYS, UNITS } from "@/server/units/units";

/**
 * Support tickets: a customer asks, our team answers, the customer can
 * reply until it's resolved. Staff can add internal notes the customer
 * doesn't see; that a note was added still shows in their activity log.
 */

export const MAX_BODY = 5000;
export const MAX_SUBJECT = 120;

export interface CustomerSupportDeps {
  db: TenantDb;
  organisation: { id: string };
  actor: Actor;
}

function cleanBody(body: string, field = "body") {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new DomainError("invalid", "Write your message.", field);
  if (text.length > MAX_BODY) throw new DomainError("invalid", `Keep it under ${MAX_BODY.toLocaleString("en-GB")} characters.`, field);
  return text;
}

export async function openTicket(deps: CustomerSupportDeps, input: { subject: string; body: string; serviceName?: string; conversationId?: string }) {
  assertCan(deps.actor, "support");
  const subject = input.subject.trim().replace(/\s+/g, " ");
  const fieldErrors: Record<string, string> = {};
  if (!subject) fieldErrors.subject = "Say in a few words what it's about.";
  else if (subject.length > MAX_SUBJECT) fieldErrors.subject = `Keep it under ${MAX_SUBJECT} characters.`;
  let body = "";
  try {
    body = cleanBody(input.body);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    fieldErrors.body = e.message;
  }
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the form.", undefined, fieldErrors);

  return deps.db.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: { reference: newReference("TKT"), organisationId: deps.organisation.id, subject, openedById: deps.actor.userId, conversationId: input.conversationId ?? null },
    });
    await tx.ticketMessage.create({
      data: {
        organisationId: deps.organisation.id,
        ticketId: ticket.id,
        authorKind: "CUSTOMER",
        authorUserId: deps.actor.userId,
        authorLabel: deps.actor.name,
        body: input.serviceName ? `About: ${input.serviceName}\n\n${body}` : body,
      },
    });
    await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "ticket.opened", summary: `Asked for help: ${subject} (${ticket.reference})`, targetType: "Ticket", targetId: ticket.id }));
    return ticket;
  });
}

type RatingTx = { ticket: { update: PrismaClient["ticket"]["update"] }; outboundEmail: PrismaClient["outboundEmail"]; user: { findUnique: PrismaClient["user"]["findUnique"] } };

/** When a ticket is resolved with "Service standards" on (U7): one email asking how we did, once per ticket. */
async function askForRating(tx: RatingTx, ticket: Ticket, standardsOn: boolean) {
  if (!standardsOn || ticket.rating !== null || ticket.ratingToken) return;
  const opener = await tx.user.findUnique({ where: { id: ticket.openedById }, select: { email: true } });
  if (!opener) return;
  await tx.ticket.update({ where: { id: ticket.id }, data: { ratingToken: randomBytes(24).toString("base64url") } });
  await queueEmail(tx, { organisationId: ticket.organisationId, to: opener.email, kind: "ticket.rating", payload: { ticketId: ticket.id } });
}

const standardsOn = (db: unknown) => featureOn(db as Pick<PrismaClient, "featureSwitch">, "service-standards");

async function ownTicket(db: TenantDb, reference: string) {
  const ticket = await db.ticket.findFirst({ where: { reference, deletedAt: null } });
  if (!ticket) throw new DomainError("not-found", "That ticket isn't on your account.");
  return ticket;
}

export async function customerReply(deps: CustomerSupportDeps, reference: string, rawBody: string) {
  assertCan(deps.actor, "support");
  const ticket = await ownTicket(deps.db, reference);
  const body = cleanBody(rawBody);
  return deps.db.$transaction(async (tx) => {
    await tx.ticketMessage.create({ data: { organisationId: deps.organisation.id, ticketId: ticket.id, authorKind: "CUSTOMER", authorUserId: deps.actor.userId, authorLabel: deps.actor.name, body } });
    // Replying reopens a resolved ticket.
    return tx.ticket.update({ where: { id: ticket.id }, data: { status: "OPEN", resolvedAt: null } });
  });
}

export async function customerResolve(deps: CustomerSupportDeps, reference: string) {
  assertCan(deps.actor, "support");
  const ticket = await ownTicket(deps.db, reference);
  if (ticket.status === "RESOLVED") return ticket;
  const rate = await standardsOn(deps.db);
  return deps.db.$transaction(async (tx) => {
    await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "ticket.resolved", summary: `Marked ${ticket.reference} as sorted`, targetType: "Ticket", targetId: ticket.id }));
    const resolved = await tx.ticket.update({ where: { id: ticket.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await askForRating(tx as unknown as RatingTx, resolved, rate);
    return resolved;
  });
}

/** A ticket with the messages the customer may see. */
export async function ticketForCustomer(db: TenantDb, reference: string) {
  return db.ticket.findFirst({
    where: { reference, deletedAt: null },
    include: { messages: { where: { internal: false }, orderBy: { createdAt: "asc" } } },
  });
}

export async function ticketsForCustomer(db: TenantDb) {
  return db.ticket.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 50 });
}

// ─── Staff side ──────────────────────────────────────────────────────

export async function ticketQueue(db: PrismaClient, status: "open" | "resolved" = "open") {
  return db.ticket.findMany({
    where: { deletedAt: null, status: status === "open" ? { in: ["OPEN", "WAITING_ON_CUSTOMER"] } : "RESOLVED" },
    orderBy: { updatedAt: status === "open" ? "asc" : "desc" },
    take: 100,
    include: { organisation: { select: { id: true, name: true } }, assignee: { select: { name: true } }, _count: { select: { messages: true } } },
  });
}

export async function ticketForStaff(db: PrismaClient, reference: string) {
  return db.ticket.findUnique({
    where: { reference },
    include: {
      organisation: { select: { id: true, name: true, timeZone: true } },
      messages: { orderBy: { createdAt: "asc" } },
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } }, actions: { orderBy: { createdAt: "asc" } } } },
    },
  });
}

export async function staffReply(
  deps: { db: PrismaClient; staff: StaffActor },
  reference: string,
  input: { body: string; internal?: boolean; status?: TicketStatus },
): Promise<Ticket> {
  assertStaffCan(deps.staff, "answerTickets");
  const ticket = await deps.db.ticket.findUnique({ where: { reference } });
  if (!ticket || ticket.deletedAt) throw new DomainError("not-found", "No such ticket.");
  const body = cleanBody(input.body);
  const internal = Boolean(input.internal);
  const status = internal ? ticket.status : (input.status ?? "WAITING_ON_CUSTOMER");
  const opener = await deps.db.user.findUnique({ where: { id: ticket.openedById }, select: { email: true } });
  const rate = await standardsOn(deps.db);
  const now = new Date();

  return deps.db.$transaction(async (tx) => {
    await tx.ticketMessage.create({ data: { organisationId: ticket.organisationId, ticketId: ticket.id, authorKind: "STAFF", authorUserId: deps.staff.userId, authorLabel: staffLabel(deps.staff), body, internal } });
    await audit(
      tx,
      staffAudit(deps.staff, ticket.organisationId, {
        action: internal ? "ticket.note" : "ticket.replied",
        summary: internal ? `Added a team note to ${ticket.reference}` : `Replied to ${ticket.reference}`,
        targetType: "Ticket",
        targetId: ticket.id,
      }),
    );
    if (!internal && opener) {
      await queueEmail(tx, { organisationId: ticket.organisationId, to: opener.email, kind: "ticket.reply", payload: { ticketId: ticket.id } });
    }
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status,
        assigneeId: ticket.assigneeId ?? deps.staff.userId,
        // Measured against the unit's targets (U7): our first reply the customer sees, and when it was resolved.
        ...(!internal && !ticket.firstResponseAt ? { firstResponseAt: now } : {}),
        ...(status === "RESOLVED" && ticket.status !== "RESOLVED" ? { resolvedAt: now } : status !== "RESOLVED" ? { resolvedAt: null } : {}),
      },
    });
    if (status === "RESOLVED" && ticket.status !== "RESOLVED") await askForRating(tx, updated, rate);
    return updated;
  });
}

/** Staff set a ticket's priority and the unit that works it (U7). Visible in the customer's activity log. */
export async function routeTicket(deps: { db: PrismaClient; staff: StaffActor }, reference: string, input: { priority: string; unit: string }) {
  assertStaffCan(deps.staff, "answerTickets");
  const ticket = await deps.db.ticket.findUnique({ where: { reference } });
  if (!ticket || ticket.deletedAt) throw new DomainError("not-found", "No such ticket.");
  const priority = input.priority as TicketPriority;
  const unit = input.unit as BusinessUnit;
  const fieldErrors: Record<string, string> = {};
  if (!PRIORITIES.includes(priority)) fieldErrors.priority = "Choose a priority.";
  if (!UNIT_KEYS.includes(unit)) fieldErrors.unit = "Choose a unit.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  if (ticket.priority === priority && ticket.unit === unit) return ticket;
  return deps.db.$transaction(async (tx) => {
    await audit(tx, staffAudit(deps.staff, ticket.organisationId, { action: "ticket.routed", summary: `Set ${ticket.reference} to ${PRIORITY_LABEL[priority].toLowerCase()} priority with ${UNITS[unit].label}`, targetType: "Ticket", targetId: ticket.id }));
    return tx.ticket.update({ where: { id: ticket.id }, data: { priority, unit } });
  });
}

/** The one-question rating, from the email's link (no sign-in) or the console. Can be changed for 30 days. */
export async function rateTicket(db: PrismaClient, where: { token: string } | { reference: string; organisationId: string }, input: { score: number; comment?: string }, now = new Date()) {
  if (!(await standardsOn(db))) throw new DomainError("not-found", "Ratings aren't open.");
  const ticket = "token" in where ? (where.token ? await db.ticket.findUnique({ where: { ratingToken: where.token } }) : null) : await db.ticket.findFirst({ where: { reference: where.reference, organisationId: where.organisationId } });
  if (!ticket || ticket.deletedAt) throw new DomainError("not-found", "That link has expired.");
  if (ticket.status !== "RESOLVED") throw new DomainError("conflict", "You can rate it once it's sorted.");
  if (ticket.ratedAt && now.getTime() - ticket.ratedAt.getTime() > 30 * 86_400_000) throw new DomainError("conflict", "Thanks, your rating is in.");
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw new DomainError("invalid", "Choose from 1 to 5.", "score");
  const comment = input.comment?.trim().slice(0, 1000) || null;
  return db.ticket.update({ where: { id: ticket.id }, data: { rating: input.score, ratingComment: comment, ratedAt: now } });
}
