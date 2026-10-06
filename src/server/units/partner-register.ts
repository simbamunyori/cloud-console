import type { PartnerStatus, PrismaClient } from "@prisma/client";
import { parseDateOnly } from "@/lib/dates";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { renewalsDue } from "./units";

/**
 * The partner register (STRATEGY_ROLLOUT U7): each partner's status,
 * contacts, agreement, renewal date and the products that depend on it.
 * Admins are emailed before each agreement's notice period starts, once
 * per renewal date. Staff only; customers never see partner names.
 */

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = { PROSPECT: "Talking to them", ACTIVE: "Active", PAUSED: "Paused", ENDED: "Ended" };
export const PARTNER_CATEGORIES = ["Distributor", "Licensing", "Security provider", "Backup provider", "Registrar", "Data centre", "Connectivity", "Payments", "Software", "Other"];

export interface PartnerRecordInput {
  name: string;
  category: string;
  status: string;
  contacts: string;
  agreementRef: string;
  agreementUrl: string;
  startsOn: string;
  renewsOn: string;
  noticeDays: string;
  products: string;
  notes: string;
}

export async function partnerRegister(db: Pick<PrismaClient, "partnerRecord">) {
  return db.partnerRecord.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
}

export async function savePartnerRecord(deps: { db: PrismaClient; staff: StaffActor }, id: string | null, input: PartnerRecordInput) {
  assertStaffCan(deps.staff, "managePartners");
  const current = id ? await deps.db.partnerRecord.findUnique({ where: { id } }) : null;
  if (id && !current) throw new DomainError("not-found", "No such partner.");
  const fieldErrors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name || name.length > 120) fieldErrors.name = "Enter the partner's name.";
  if (!PARTNER_CATEGORIES.includes(input.category)) fieldErrors.category = "Choose a category.";
  if (!(input.status in PARTNER_STATUS_LABEL)) fieldErrors.status = "Choose a status.";
  const startsOn = input.startsOn.trim() ? parseDateOnly(input.startsOn.trim()) : null;
  const renewsOn = input.renewsOn.trim() ? parseDateOnly(input.renewsOn.trim()) : null;
  if (input.startsOn.trim() && !startsOn) fieldErrors.startsOn = "Enter a date.";
  if (input.renewsOn.trim() && !renewsOn) fieldErrors.renewsOn = "Enter a date.";
  if (startsOn && renewsOn && renewsOn <= startsOn) fieldErrors.renewsOn = "The renewal comes after the start.";
  const noticeDays = input.noticeDays.trim() ? Number(input.noticeDays) : 60;
  if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) fieldErrors.noticeDays = "Enter days from 0 to 365.";
  const url = input.agreementUrl.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) fieldErrors.agreementUrl = "Enter an address starting with https://.";
  const products = [...new Set(input.products.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (products.some((p) => !/^[a-z0-9-]{2,80}$/.test(p))) fieldErrors.products = "Enter product slugs, such as business-email, separated by commas.";
  else if (products.length) {
    const known = await deps.db.product.findMany({ where: { slug: { in: products } }, select: { slug: true } });
    const missing = products.filter((p) => !known.some((k) => k.slug === p));
    if (missing.length) fieldErrors.products = `Not in the catalogue: ${missing.join(", ")}.`;
  }
  for (const [k, max] of [["contacts", 2000], ["notes", 4000], ["agreementRef", 200]] as const) if (input[k].length > max) fieldErrors[k] = "That's too long.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);

  const data = {
    name,
    category: input.category,
    status: input.status as PartnerStatus,
    contacts: input.contacts.trim() || null,
    agreementRef: input.agreementRef.trim() || null,
    agreementUrl: url || null,
    startsOn,
    renewsOn,
    noticeDays,
    products,
    notes: input.notes.trim() || null,
    updatedById: deps.staff.userId,
  };
  return deps.db.$transaction(async (tx) => {
    const saved = current ? await tx.partnerRecord.update({ where: { id: current.id }, data }) : await tx.partnerRecord.create({ data });
    await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: current ? "partner-register.changed" : "partner-register.added", summary: `${current ? "Changed" : "Added"} ${name} in the partner register`, data: { id: saved.id } } });
    return saved;
  });
}

/** Daily: emails Admins about each agreement coming up for renewal, once per renewal date. */
export async function remindRenewals(db: PrismaClient, now = new Date()) {
  const due = (await renewalsDue(db, now)).filter((r) => !r.remindedFor || r.remindedFor.getTime() !== r.renewsOn!.getTime());
  if (!due.length) return 0;
  const admins = await db.user.findMany({ where: { kind: "STAFF", staffRole: "ADMIN", deactivatedAt: null }, select: { email: true } });
  let sent = 0;
  for (const r of due) {
    const claimed = await db.partnerRecord.updateMany({ where: { id: r.id, OR: [{ remindedFor: null }, { remindedFor: { not: r.renewsOn! } }] }, data: { remindedFor: r.renewsOn } });
    if (!claimed.count) continue;
    for (const a of admins) await queueEmail(db, { to: a.email, kind: "partner.renewal", payload: { partnerId: r.id } });
    sent++;
  }
  return sent;
}
