import type { PrismaClient } from "@prisma/client";
import { featureSwitches } from "@/server/features/features";
import { can, DomainError, type Actor } from "@/server/org/access";
import { audit } from "@/server/org/audit";
import type { TenantDb } from "@/server/db";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";

/**
 * The console experience (docs/STRATEGY_ROLLOUT.md, U11): a new customer's
 * first-week checklist and the named colleague who looks after them, both
 * on the home page and each behind its own switch in Admin > Features.
 */

/** The checklist shows for a customer's first two weeks, unless they finish or hide it sooner. */
export const WELCOME_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export interface WelcomeItem {
  key: "company" | "team" | "service" | "score";
  title: string;
  text: string;
  href: string;
  done: boolean;
}

/**
 * The first-week checklist for Owners and Admins, or null when it doesn't
 * show. Each item is worked out from what the customer has already done.
 */
export async function welcomeChecklist(db: PrismaClient, tenant: TenantDb, input: { organisationId: string; actor: Pick<Actor, "role">; liveServices: number; now?: Date }): Promise<{ items: WelcomeItem[]; done: number } | null> {
  const features = await featureSwitches(db);
  if (!features["first-week-checklist"] || !can(input.actor, "manageOrganisation")) return null;
  const now = input.now ?? new Date();
  const org = await db.organisation.findUniqueOrThrow({ where: { id: input.organisationId }, select: { createdAt: true, addressLine1: true, city: true, welcomeChecklist: { select: { dismissedAt: true } } } });
  if (org.welcomeChecklist?.dismissedAt || now.getTime() - org.createdAt.getTime() > WELCOME_DAYS * DAY) return null;
  const [members, invitations, orders, quotes, profile] = await Promise.all([
    tenant.membership.count({ where: { active: true } }),
    tenant.invitation.count({ where: { acceptedAt: null, revokedAt: null } }),
    tenant.order.count(),
    tenant.quote.count(),
    features["security-score"] ? db.securityProfile.findUnique({ where: { organisationId: input.organisationId }, select: { emailDomain: true } }) : null,
  ]);
  const items: WelcomeItem[] = [
    { key: "company", title: "Add your company details", text: "Your address goes on every invoice.", href: "/app/settings", done: Boolean(org.addressLine1 && org.city) },
    { key: "team", title: "Invite your team", text: "Add the people who order, pay or need support.", href: "/app/team", done: members > 1 || invitations > 0 },
    { key: "service", title: "Order your first service", text: "Or ask for a quote, and we'll move what you have.", href: "/app/marketplace", done: input.liveServices > 0 || orders > 0 || quotes > 0 },
  ];
  if (features["security-score"]) items.push({ key: "score", title: "See your security score", text: "Add your email domain and we'll check it every night.", href: "/app/security/score", done: Boolean(profile?.emailDomain) });
  const done = items.filter((i) => i.done).length;
  return done === items.length ? null : { items, done };
}

/** An Owner or Admin hides the checklist for everyone in the organisation. */
export async function dismissWelcome(deps: { db: PrismaClient; actor: Actor }, organisationId: string, now = new Date()) {
  if (!can(deps.actor, "manageOrganisation")) throw new DomainError("forbidden", "Your role doesn't allow that. Ask an owner or admin.");
  await deps.db.welcomeChecklist.upsert({
    where: { organisationId },
    update: { dismissedAt: now, dismissedById: deps.actor.userId },
    create: { organisationId, dismissedAt: now, dismissedById: deps.actor.userId },
  });
}

export interface ContactCard {
  name: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
}

/** The colleague who looks after this customer, once named and while they work here. */
export async function accountContact(db: PrismaClient, organisationId: string): Promise<ContactCard | null> {
  if (!(await featureSwitches(db))["account-contacts"]) return null;
  const row = await db.accountContact.findUnique({ where: { organisationId }, select: { user: { select: { name: true, email: true, deactivatedAt: true, kind: true, contactCard: true } } } });
  if (!row || row.user.deactivatedAt || row.user.kind !== "STAFF") return null;
  return { name: row.user.name, email: row.user.email, jobTitle: row.user.contactCard?.jobTitle ?? null, phone: row.user.contactCard?.phone ?? null };
}

/** Colleagues who can be named as an account contact. */
export async function contactChoices(db: PrismaClient) {
  return db.user.findMany({ where: { kind: "STAFF", deactivatedAt: null }, select: { id: true, name: true, contactCard: { select: { jobTitle: true } } }, orderBy: { name: "asc" } });
}

/** An Admin names, changes or removes a customer's account contact. The customer's activity log shows it. */
export async function setAccountContact(deps: { db: PrismaClient; staff: StaffActor }, organisationId: string, userId: string) {
  assertStaffCan(deps.staff, "assignAccountContacts");
  const org = await deps.db.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
  if (!org) throw new DomainError("not-found", "No such customer.");
  if (!userId) {
    await deps.db.$transaction(async (tx) => {
      const removed = await tx.accountContact.deleteMany({ where: { organisationId } });
      if (removed.count) await audit(tx, staffAudit(deps.staff, organisationId, { action: "account-contact.removed", summary: "Removed the named account contact", targetType: "Organisation", targetId: organisationId }));
    });
    return;
  }
  const user = await deps.db.user.findFirst({ where: { id: userId, kind: "STAFF", deactivatedAt: null }, select: { id: true, name: true } });
  if (!user) throw new DomainError("invalid", "Choose a colleague.", "userId");
  await deps.db.$transaction(async (tx) => {
    await tx.accountContact.upsert({ where: { organisationId }, update: { userId, assignedById: deps.staff.userId, assignedAt: new Date() }, create: { organisationId, userId, assignedById: deps.staff.userId } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "account-contact.set", summary: `${user.name} now looks after this account`, targetType: "Organisation", targetId: organisationId }));
  });
}

const PHONE = /^\+?[0-9 ()-]{6,24}$/;

/** Each colleague keeps the title and phone customers see on their own contact card. */
export async function saveContactCard(deps: { db: PrismaClient; staff: StaffActor }, input: { jobTitle: string; phone: string }) {
  const jobTitle = input.jobTitle.trim();
  const phone = input.phone.trim();
  const fieldErrors: Record<string, string> = {};
  if (jobTitle.length > 80) fieldErrors.jobTitle = "Keep it under 80 characters.";
  if (phone && !PHONE.test(phone)) fieldErrors.phone = "Enter a phone number, such as +267 390 0000.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const data = { jobTitle: jobTitle || null, phone: phone || null };
  await deps.db.$transaction(async (tx) => {
    await tx.staffContactCard.upsert({ where: { userId: deps.staff.userId }, update: data, create: { userId: deps.staff.userId, ...data } });
    await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "contact-card.changed", summary: "Changed their contact card" } });
  });
}
