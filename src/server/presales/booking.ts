import type { Prisma, PrismaClient, PresalesBooking } from "@prisma/client";
import { addDays, formatMoment, todayIn, toDateOnly, zonedTime } from "@/lib/dates";
import { hashToken, newToken } from "@/server/auth/tokens";
import type { Touch } from "@/server/campaigns/campaigns";
import { queueEmail } from "@/server/email/outbox";
import { captureLead, checkContact } from "@/server/leads/capture";
import { DomainError } from "@/server/org/access";
import { newReference } from "@/server/orders/orders";
import { assertStaffCan, staffCan, staffLabel, type StaffActor } from "@/server/staff/access";

/**
 * Book a pre-sales engineer (final build, Milestone 8). Staff who take
 * pre-sales calls set their weekly hours in the admin area; the public
 * booking page offers the free half-hours in the next two weeks, and a
 * booking sends a calendar invite to the visitor and the engineer. While
 * nobody has hours set, every link to the booking page hides.
 */

export const SLOT_MINUTES = 30;
export const BOOKING_DAYS = 14;
/** The earliest a call can be booked, from now. */
export const NOTICE_HOURS = 4;

export const TOPICS: Record<string, string> = {
  general: "Help choosing services",
  thebe: "A demo of Thebe",
  "email-check": "Your email security report",
  "cost-calculator": "Microsoft 365 or Google Workspace",
  "data-protection": "Data protection readiness",
  quote: "Your quote",
  product: "A product on our website",
};
export const topicOf = (t: unknown) => (typeof t === "string" && t in TOPICS ? t : "general");

export const BOOKING_CONSENT = "Fourth Generation Technologies may contact me about this call by email or phone, and keep my details for 12 months, as the Privacy Notice explains.";

export interface Hours {
  /** 1 is Monday, 7 is Sunday. */
  day: number;
  from: string;
  to: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export function hoursOf(value: Prisma.JsonValue): Hours[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const h = v as Partial<Hours>;
    return typeof h?.day === "number" && h.day >= 1 && h.day <= 7 && HHMM.test(h.from ?? "") && HHMM.test(h.to ?? "") && minutes(h.to!) > minutes(h.from!)
      ? [{ day: h.day, from: h.from!, to: h.to! }]
      : [];
  });
}

type Db = Pick<PrismaClient, "presalesEngineer" | "presalesBooking">;

/** Whether anyone takes bookings: the links to the booking page show only then. */
export async function bookingOpen(db: Pick<PrismaClient, "presalesEngineer">) {
  const engineers = await db.presalesEngineer.findMany({ where: { active: true, user: { deactivatedAt: null, staffRole: { not: null } } }, select: { hours: true } });
  return engineers.some((e) => hoursOf(e.hours).length > 0);
}

export interface Slot {
  /** ISO start time; what the form sends back. */
  start: string;
  /** "09:30" in the visitor's market time zone. */
  label: string;
}

/** The free half-hours, by day in the market's time zone. */
export async function freeSlots(db: Db, timeZone: string, now = new Date()): Promise<{ day: string; slots: Slot[] }[]> {
  const engineers = await db.presalesEngineer.findMany({ where: { active: true, user: { deactivatedAt: null, staffRole: { not: null } } } });
  if (!engineers.length) return [];
  const until = new Date(now.getTime() + (BOOKING_DAYS + 1) * 86_400_000);
  const booked = await db.presalesBooking.findMany({ where: { status: "BOOKED", startsAt: { lt: until }, endsAt: { gt: now } }, select: { engineerId: true, startsAt: true, endsAt: true } });
  const earliest = now.getTime() + NOTICE_HOURS * 3_600_000;
  const starts = new Set<number>();
  for (const e of engineers) {
    const today = todayIn(e.timeZone, now);
    for (let i = 0; i <= BOOKING_DAYS; i++) {
      const day = addDays(today, i);
      const weekday = ((day.getUTCDay() + 6) % 7) + 1;
      for (const h of hoursOf(e.hours).filter((x) => x.day === weekday)) {
        for (let m = minutes(h.from); m + SLOT_MINUTES <= minutes(h.to); m += SLOT_MINUTES) {
          const at = zonedTime(toDateOnly(day), `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, e.timeZone);
          if (!at || at.getTime() < earliest || at.getTime() > until.getTime()) continue;
          const end = at.getTime() + SLOT_MINUTES * 60_000;
          if (booked.some((b) => b.engineerId === e.id && b.startsAt.getTime() < end && b.endsAt.getTime() > at.getTime())) continue;
          starts.add(at.getTime());
        }
      }
    }
  }
  const byDay = new Map<string, Slot[]>();
  for (const t of [...starts].sort((a, b) => a - b)) {
    const at = new Date(t);
    const day = toDateOnly(todayIn(timeZone, at));
    const label = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    byDay.set(day, [...(byDay.get(day) ?? []), { start: at.toISOString(), label }]);
  }
  return [...byDay].map(([day, slots]) => ({ day, slots }));
}

export interface BookingInput {
  start: string;
  topic: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
  consent: boolean;
}

/**
 * Books the half-hour with an engineer who is free then, the one with the
 * fewest calls coming up first. A lock per engineer stops two visitors
 * taking the same time.
 */
export async function bookCall(db: PrismaClient, market: { code: string; timeZone: string }, input: BookingInput, o: { touch?: Touch | null; now?: Date } = {}): Promise<PresalesBooking> {
  const now = o.now ?? new Date();
  const fieldErrors: Record<string, string> = {};
  try {
    checkContact({ name: input.name, email: input.email, consent: input.consent }, { nameRequired: true });
  } catch (e) {
    if (e instanceof DomainError && e.fieldErrors) Object.assign(fieldErrors, e.fieldErrors);
    else throw e;
  }
  const start = new Date(input.start);
  if (!input.start || Number.isNaN(start.getTime())) fieldErrors.start = "Choose a time.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the form.", undefined, fieldErrors);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
  const topic = topicOf(input.topic);
  const taken = () => new DomainError("invalid", "Someone has just booked that time. Choose another.", "start");

  const free = (await freeSlots(db, market.timeZone, now)).some((d) => d.slots.some((s) => s.start === start.toISOString()));
  if (!free) throw taken();

  const engineers = await db.presalesEngineer.findMany({
    where: { active: true, user: { deactivatedAt: null, staffRole: { not: null } } },
    include: { _count: { select: { bookings: { where: { status: "BOOKED", startsAt: { gte: now } } } } } },
  });
  const candidates = engineers
    .filter((e) => {
      const local = todayIn(e.timeZone, start);
      const weekday = ((local.getUTCDay() + 6) % 7) + 1;
      return hoursOf(e.hours).some((h) => {
        if (h.day !== weekday) return false;
        const from = zonedTime(toDateOnly(local), h.from, e.timeZone);
        const to = zonedTime(toDateOnly(local), h.to, e.timeZone);
        return from && to && start >= from && end <= to;
      });
    })
    .sort((a, b) => a._count.bookings - b._count.bookings);

  for (const engineer of candidates) {
    const booking = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`presales:${engineer.id}`}))`;
      const clash = await tx.presalesBooking.count({ where: { engineerId: engineer.id, status: "BOOKED", startsAt: { lt: end }, endsAt: { gt: start } } });
      if (clash) return null;
      const lead = await captureLead(
        tx,
        {
          market: market.code,
          source: "BOOKING",
          tool: topic,
          name: input.name,
          email: input.email,
          phone: input.phone,
          company: input.company,
          need: `Booked a call (${TOPICS[topic]}) for ${formatMoment(start, market.timeZone)}.${input.notes?.trim() ? ` ${input.notes.trim()}` : ""}`,
          consentText: BOOKING_CONSENT,
          followUps: false,
          touch: o.touch,
        },
        now,
      );
      // A person on a call hears from the engineer, not from a sequence asking them to book one.
      await tx.lead.updateMany({
        where: { email: lead.email, market: market.code, followUpStoppedAt: null, followUp: { not: null } },
        data: { followUpAt: null, followUpStoppedAt: now, followUpStopped: "booked" },
      });
      const row = await tx.presalesBooking.create({
        data: {
          reference: newReference("CALL"),
          engineerId: engineer.id,
          market: market.code,
          startsAt: start,
          endsAt: end,
          topic,
          name: input.name.trim().slice(0, 100),
          email: input.email.trim().toLowerCase().slice(0, 200),
          phone: input.phone?.trim().slice(0, 40) || null,
          company: input.company?.trim().slice(0, 120) || null,
          notes: (input.notes ?? "").trim().slice(0, 1000),
          leadId: lead.id,
          // Each email to the visitor makes a fresh cancel link (src/server/email/templates.ts).
          cancelTokenHash: hashToken(newToken()),
        },
      });
      await queueEmail(tx, { to: row.email, kind: "booking.invite", payload: { bookingId: row.id, to: "visitor" } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: engineer.userId }, select: { email: true } });
      await queueEmail(tx, { to: user.email, kind: "booking.invite", payload: { bookingId: row.id, to: "engineer" } });
      return row;
    });
    if (booking) return booking;
  }
  throw taken();
}

async function cancel(db: PrismaClient, booking: PresalesBooking, by: string, now: Date) {
  if (booking.status === "CANCELLED") return booking;
  return db.$transaction(async (tx) => {
    const row = await tx.presalesBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledBy: by, sequence: { increment: 1 } } });
    const engineer = await tx.presalesEngineer.findUniqueOrThrow({ where: { id: row.engineerId }, include: { user: { select: { email: true } } } });
    await queueEmail(tx, { to: row.email, kind: "booking.cancelled", payload: { bookingId: row.id, to: "visitor" } });
    await queueEmail(tx, { to: engineer.user.email, kind: "booking.cancelled", payload: { bookingId: row.id, to: "engineer" } });
    return row;
  });
}

/** The booking a visitor's cancel link names, or null. */
export function bookingByToken(db: Pick<PrismaClient, "presalesBooking">, token: string) {
  return db.presalesBooking.findUnique({ where: { cancelTokenHash: hashToken(token) } });
}

/** The visitor cancels from the link in their email. */
export async function cancelByVisitor(db: PrismaClient, token: string, now = new Date()) {
  const booking = await bookingByToken(db, token);
  if (!booking) throw new DomainError("not-found", "We couldn't find that call. It may have been cancelled already.");
  if (booking.startsAt <= now && booking.status === "BOOKED") throw new DomainError("invalid", "That call has already started.");
  return cancel(db, booking, "visitor", now);
}

// ─── Staff ───────────────────────────────────────────────────────────

export async function myAvailability(db: Pick<PrismaClient, "presalesEngineer">, staff: StaffActor) {
  assertStaffCan(staff, "viewCustomers");
  return db.presalesEngineer.findUnique({ where: { userId: staff.userId } });
}

export async function saveAvailability(db: PrismaClient, staff: StaffActor, input: { active: boolean; meetingUrl: string; hours: Hours[]; timeZone: string }) {
  assertStaffCan(staff, "viewCustomers");
  const meetingUrl = input.meetingUrl.trim();
  if (meetingUrl && !/^https:\/\/[^\s]+$/.test(meetingUrl)) throw new DomainError("invalid", "Use a link that starts with https://.", "meetingUrl");
  const hours = hoursOf(input.hours as unknown as Prisma.JsonValue);
  if (hours.length !== input.hours.length) throw new DomainError("invalid", "Each time needs a start before its end, as HH:MM.", "hours");
  const data = { active: input.active, meetingUrl: meetingUrl || null, hours: hours as unknown as Prisma.InputJsonValue, timeZone: input.timeZone };
  await db.$transaction(async (tx) => {
    await tx.presalesEngineer.upsert({ where: { userId: staff.userId }, create: { userId: staff.userId, ...data }, update: data });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: staff.userId,
        actorLabel: staffLabel(staff),
        action: "presales.hours",
        summary: `${input.active ? "Set" : "Paused"} pre-sales hours for ${staff.name}`,
        data: { hours: hours.length, active: input.active } as Prisma.InputJsonValue,
      },
    });
  });
}

/** Upcoming calls: an admin sees everyone's, others their own. */
export async function upcomingBookings(db: Pick<PrismaClient, "presalesBooking">, staff: StaffActor, now = new Date()) {
  assertStaffCan(staff, "viewCustomers");
  return db.presalesBooking.findMany({
    where: { endsAt: { gte: new Date(now.getTime() - 86_400_000) }, ...(staffCan(staff, "manageStaff") ? {} : { engineer: { userId: staff.userId } }) },
    include: { engineer: { include: { user: { select: { name: true } } } }, lead: { select: { reference: true } } },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
}

export async function cancelByStaff(db: PrismaClient, staff: StaffActor, reference: string, now = new Date()) {
  assertStaffCan(staff, "viewCustomers");
  const booking = await db.presalesBooking.findUnique({ where: { reference }, include: { engineer: true } });
  if (!booking || (!staffCan(staff, "manageStaff") && booking.engineer.userId !== staff.userId)) throw new DomainError("not-found", "That call isn't there any more.");
  await cancel(db, booking, staff.name, now);
  await db.staffAuditEvent.create({
    data: {
      actorUserId: staff.userId,
      actorLabel: staffLabel(staff),
      action: "presales.cancel",
      summary: `Cancelled call ${booking.reference} with ${booking.name}`,
      data: { booking: booking.reference },
    },
  });
}

/** A day before each call, a reminder to the visitor. */
export async function sendReminders(db: PrismaClient, now = new Date()) {
  const due = await db.presalesBooking.findMany({
    where: { status: "BOOKED", reminderSentAt: null, startsAt: { gt: new Date(now.getTime() + 2 * 3_600_000), lte: new Date(now.getTime() + 24 * 3_600_000) } },
  });
  for (const b of due) {
    await db.$transaction(async (tx) => {
      const claim = await tx.presalesBooking.updateMany({ where: { id: b.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (claim.count === 1) await queueEmail(tx, { to: b.email, kind: "booking.reminder", payload: { bookingId: b.id } });
    });
  }
  return due.length;
}
