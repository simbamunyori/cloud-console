import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * People who tried to open an account from a country we don't serve yet.
 * No account is made; staff see the list in the admin console and get in
 * touch when a market opens.
 */

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep it under 80 characters."),
  email: z.email("Enter an email address like name@company.com.").trim().toLowerCase().max(160),
  company: z.string().trim().max(120, "Keep it under 120 characters.").optional(),
  country: z.string().trim().toUpperCase().refine(isCountryCode, "Choose your country."),
  phone: z.string().trim().max(40, "Keep it under 40 characters.").optional(),
  message: z.string().trim().max(1000, "Keep it under 1,000 characters.").optional(),
});

export type WaitlistInput = z.input<typeof schema>;

const blank = (v?: string) => (v ? v : null);

export async function joinWaitlist(db: Pick<PrismaClient, "waitlistEntry">, input: WaitlistInput) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  }
  const v = parsed.data;
  // One entry per email and country; a second visit updates it.
  const existing = await db.waitlistEntry.findFirst({ where: { email: v.email, country: v.country } });
  const data = { name: v.name, email: v.email, company: blank(v.company), country: v.country, phone: blank(v.phone), message: blank(v.message) };
  return existing ? db.waitlistEntry.update({ where: { id: existing.id }, data }) : db.waitlistEntry.create({ data });
}

export async function waitlist(db: Pick<PrismaClient, "waitlistEntry">, staff: StaffActor) {
  assertStaffCan(staff, "viewCustomers");
  return db.waitlistEntry.findMany({ orderBy: [{ contactedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 500 });
}

export async function markContacted(db: Pick<PrismaClient, "waitlistEntry">, staff: StaffActor, id: string) {
  assertStaffCan(staff, "viewCustomers");
  const updated = await db.waitlistEntry.updateMany({ where: { id, contactedAt: null }, data: { contactedAt: new Date(), contactedBy: staff.name } });
  if (!updated.count && !(await db.waitlistEntry.findUnique({ where: { id } }))) throw new DomainError("not-found", "No such entry.");
}
