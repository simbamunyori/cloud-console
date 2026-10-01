import type { LeadSource, LeadStatus, Prisma, PrismaClient } from "@prisma/client";
import { company } from "@/config/app";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { newReference } from "@/server/orders/orders";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { findChat } from "./assistant";

/**
 * Leads from Thapelo: a visitor who wants to talk to a person, or asked us
 * to get back to them. They give their details in a form, never in the
 * chat, and tick consent first. Staff get an email with the whole
 * conversation and see it at /admin/leads.
 */

/** Leads, and the chat that came with them, are deleted this long after they last changed (Privacy Notice). */
export const LEAD_KEEP_MONTHS = 12;

export const CONSENT_TEXT = `${company.name} may contact me about this by email or phone, and keep my details and this conversation for 12 months, as the Privacy Notice explains.`;

const keepUntil = (now: Date) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + LEAD_KEEP_MONTHS);
  return d;
};

export interface LeadInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  need: string;
  consent: boolean;
  reason: "person" | "follow-up";
}

export async function createLead(
  prisma: PrismaClient,
  market: { code: string; supportEmail: string },
  input: LeadInput,
  o: { token?: string; ipAddress: string | null; now?: Date },
): Promise<{ reference: string }> {
  const now = o.now ?? new Date();
  const name = input.name.trim().slice(0, 100);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const phone = input.phone?.trim().slice(0, 40) || null;
  const organisation = input.company?.trim().slice(0, 120) || null;
  const need = input.need.trim().slice(0, 2000);
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter an email address like name@company.com.";
  if (!need) fieldErrors.need = "Tell us what you need.";
  if (!input.consent) fieldErrors.consent = "Tick the box so we may contact you.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the form.", undefined, fieldErrors);

  try {
    await enforce(prisma, `leadPerIp:${o.ipAddress ?? "unknown"}`, LIMITS.leadPerIp, now);
  } catch (e) {
    if (e instanceof RateLimitedError) throw new DomainError("unavailable", `That's a lot of requests from this network. Email ${market.supportEmail} instead.`);
    throw e;
  }

  const chat = await findChat(prisma, o.token, market.code);
  const source: LeadSource = input.reason === "person" ? "PERSON" : "ASSISTANT";
  const purgeAfter = keepUntil(now);
  const lead = await prisma.$transaction(async (tx) => {
    // One lead per chat: asking again updates it.
    const existing = chat ? await tx.lead.findUnique({ where: { chatId: chat.id } }) : null;
    const data = { name, email, phone, company: organisation, need, consentText: CONSENT_TEXT, consentAt: now, purgeAfter };
    const saved = existing
      ? await tx.lead.update({ where: { id: existing.id }, data: { ...data, source, status: "NEW" } })
      : await tx.lead.create({ data: { ...data, reference: newReference("LEAD"), market: market.code, source, chatId: chat?.id ?? null } });
    if (chat) await tx.salesChat.update({ where: { id: chat.id }, data: { purgeAfter, ...(source === "PERSON" ? { handedOverAt: now } : {}) } });
    await queueEmail(tx, { to: market.supportEmail, kind: "lead.new", payload: { leadId: saved.id } });
    await queueEmail(tx, { to: email, kind: "lead.received", payload: { leadId: saved.id } });
    return saved;
  });
  return { reference: lead.reference };
}

/** The chat as staff read it: who said what, and what Thapelo looked up. */
export function transcript(messages: { role: string; text: string; toolTrace: Prisma.JsonValue }[], visitor: string) {
  return messages.map((m) => {
    const looked = Array.isArray(m.toolTrace)
      ? (m.toolTrace as { tool?: string; input?: Record<string, unknown> }[]).map((t) => `${t.tool}${t.input && Object.keys(t.input).length ? ` ${JSON.stringify(t.input)}` : ""}`)
      : [];
    return { from: m.role === "USER" ? visitor : "Thapelo", text: m.text, looked };
  });
}

export async function listLeads(prisma: PrismaClient, staff: StaffActor, status: LeadStatus | "ALL" = "NEW") {
  assertStaffCan(staff, "viewCustomers");
  return prisma.lead.findMany({ where: status === "ALL" ? {} : { status }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function leadForStaff(prisma: PrismaClient, staff: StaffActor, reference: string) {
  assertStaffCan(staff, "viewCustomers");
  const lead = await prisma.lead.findUnique({ where: { reference }, include: { chat: { include: { messages: { orderBy: { createdAt: "asc" } } } } } });
  if (!lead) return null;
  return { lead, conversation: lead.chat ? transcript(lead.chat.messages, lead.name) : [], startedOn: lead.chat?.startedOn ?? null };
}

export async function setLeadStatus(prisma: PrismaClient, staff: StaffActor, reference: string, status: LeadStatus, now = new Date()) {
  assertStaffCan(staff, "viewCustomers");
  const lead = await prisma.lead.findUnique({ where: { reference } });
  if (!lead) throw new DomainError("not-found", "That lead isn't there any more.");
  const purgeAfter = keepUntil(now);
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: { status, handledById: staff.userId, handledAt: now, purgeAfter } });
    if (lead.chatId) await tx.salesChat.update({ where: { id: lead.chatId }, data: { purgeAfter } });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: staff.userId,
        actorLabel: staffLabel(staff),
        action: "lead.status",
        summary: `Marked lead ${lead.reference} (${lead.name}) as ${status.toLowerCase()}`,
        data: { lead: lead.reference, status },
      },
    });
  });
}

/** Nightly: deletes chats and leads past their keep-until date. */
export async function purgeSales(prisma: PrismaClient, now = new Date()) {
  const leads = await prisma.lead.deleteMany({ where: { purgeAfter: { lt: now } } });
  const chats = await prisma.salesChat.deleteMany({ where: { purgeAfter: { lt: now }, lead: null } });
  return { leads: leads.count, chats: chats.count };
}
