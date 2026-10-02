import type { LeadSource, LeadStatus, Prisma, PrismaClient } from "@prisma/client";
import { company } from "@/config/app";
import type { Touch } from "@/server/campaigns/campaigns";
import { captureLead, keepUntil } from "@/server/leads/capture";
import type { CalculatorResult, EmailCheckResult, ReadinessResult } from "@/server/leads/sequences";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { findChat } from "./assistant";

/**
 * Leads from Thapelo: a visitor who wants to talk to a person, or asked us
 * to get back to them. They give their details in a form, never in the
 * chat, and tick consent first. Staff get an email with the whole
 * conversation and see it at /admin/leads.
 */

export { LEAD_KEEP_MONTHS } from "@/server/leads/capture";

export const CONSENT_TEXT = `${company.name} may contact me about this by email or phone, and keep my details and this conversation for 12 months, as the Privacy Notice explains.`;

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
  o: { token?: string; ipAddress: string | null; touch?: Touch | null; now?: Date },
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
    // One lead per chat, or per email in the market: asking again updates it.
    const saved = await captureLead(
      tx,
      { market: market.code, source, tool: "thapelo", name, email, phone, company: organisation, need, consentText: CONSENT_TEXT, followUps: true, touch: o.touch, chatId: chat?.id ?? null },
      now,
    );
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

export async function listLeads(prisma: PrismaClient, staff: StaffActor, status: LeadStatus | "ALL" = "NEW", source?: LeadSource) {
  assertStaffCan(staff, "viewCustomers");
  return prisma.lead.findMany({ where: { ...(status === "ALL" ? {} : { status }), ...(source ? { source } : {}) }, orderBy: { updatedAt: "desc" }, take: 300 });
}

export async function leadForStaff(prisma: PrismaClient, staff: StaffActor, reference: string) {
  assertStaffCan(staff, "viewCustomers");
  const lead = await prisma.lead.findUnique({
    where: { reference },
    include: {
      chat: { include: { messages: { orderBy: { createdAt: "asc" } } } },
      touches: { orderBy: { createdAt: "desc" }, take: 50 },
      bookings: { orderBy: { startsAt: "desc" }, include: { engineer: { include: { user: { select: { name: true } } } } } },
    },
  });
  if (!lead) return null;
  return { lead, conversation: lead.chat ? transcript(lead.chat.messages, lead.name) : [], startedOn: lead.chat?.startedOn ?? null, result: toolSummary(lead.tool, lead.toolResult) };
}

export async function setLeadStatus(prisma: PrismaClient, staff: StaffActor, reference: string, status: LeadStatus, now = new Date()) {
  assertStaffCan(staff, "viewCustomers");
  const lead = await prisma.lead.findUnique({ where: { reference } });
  if (!lead) throw new DomainError("not-found", "That lead isn't there any more.");
  const purgeAfter = keepUntil(now);
  await prisma.$transaction(async (tx) => {
    // Closing a lead ends its follow-up emails.
    const stop = status === "CLOSED" && lead.followUp && !lead.followUpStoppedAt ? { followUpAt: null, followUpStoppedAt: now, followUpStopped: "staff" } : {};
    await tx.lead.update({ where: { id: lead.id }, data: { status, handledById: staff.userId, handledAt: now, purgeAfter, ...stop } });
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

/** What a free tool showed the visitor, as label and value rows for staff. */
export function toolSummary(tool: string | null, value: Prisma.JsonValue | null): { title: string; rows: [string, string][] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (tool === "email-check") {
    const r = v as unknown as EmailCheckResult;
    return {
      title: `Email security check: ${r.domain}, ${r.score} out of 100`,
      rows: (r.checks ?? []).map((c) => [c.title, `${c.status === "pass" ? "Good" : c.status === "warn" ? "Needs attention" : c.status === "fail" ? "Fix this" : "Not checked"}. ${c.finding}`]),
    };
  }
  if (tool === "cost-calculator") {
    const r = v as unknown as CalculatorResult;
    return {
      title: `Cost calculator: ${r.plan?.name}`,
      rows: [
        ["People", String(r.users)],
        ["Preferred", r.provider],
        ["Recommended", `${r.plan?.name}, ${r.plan?.total} a month`],
        ...(r.alternative ? [["Alternative", `${r.alternative.name}, ${r.alternative.total} a month`] as [string, string]] : []),
      ],
    };
  }
  if (tool === "data-protection") {
    const r = v as unknown as ReadinessResult;
    return { title: `Data protection checklist: ${r.score} out of 100`, rows: (r.steps ?? []).map((step, i) => [`Step ${i + 1}`, step]) };
  }
  return null;
}

/** Staff stop a lead's follow-up emails without closing it. */
export async function stopFollowUps(prisma: PrismaClient, staff: StaffActor, reference: string, now = new Date()) {
  assertStaffCan(staff, "viewCustomers");
  const lead = await prisma.lead.findUnique({ where: { reference } });
  if (!lead) throw new DomainError("not-found", "That lead isn't there any more.");
  if (!lead.followUp || lead.followUpStoppedAt) return;
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: null, followUpStoppedAt: now, followUpStopped: "staff" } }),
    prisma.staffAuditEvent.create({
      data: {
        actorUserId: staff.userId,
        actorLabel: staffLabel(staff),
        action: "lead.follow-ups",
        summary: `Stopped follow-up emails to lead ${lead.reference} (${lead.name})`,
        data: { lead: lead.reference },
      },
    }),
  ]);
}

/** Nightly: deletes chats, leads and unclaimed checklists past their keep-until date. */
export async function purgeSales(prisma: PrismaClient, now = new Date()) {
  const leads = await prisma.lead.deleteMany({ where: { purgeAfter: { lt: now } } });
  const chats = await prisma.salesChat.deleteMany({ where: { purgeAfter: { lt: now }, lead: null } });
  const checks = await prisma.readinessCheck.deleteMany({ where: { purgeAfter: { lt: now } } });
  return { leads: leads.count, chats: chats.count, checklists: checks.count };
}
