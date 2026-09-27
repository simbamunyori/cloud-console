import type { TenantDb } from "@/server/db";
import { assertCan, DomainError, type Actor } from "./access";
import { audit, customerAudit } from "./audit";

export interface ProfileInput {
  name: string;
  registrationNumber: string;
  vatNumber: string;
  billingEmail: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  defaultPoNumber: string;
}

const LIMITS: Record<keyof ProfileInput, number> = {
  name: 120,
  registrationNumber: 40,
  vatNumber: 40,
  billingEmail: 200,
  phone: 40,
  addressLine1: 120,
  addressLine2: 120,
  city: 80,
  postcode: 20,
  defaultPoNumber: 40,
};

const LABELS: Record<keyof ProfileInput, string> = {
  name: "Name",
  registrationNumber: "Registration number",
  vatNumber: "VAT number",
  billingEmail: "Billing email",
  phone: "Phone",
  addressLine1: "Address",
  addressLine2: "Address line 2",
  city: "City or town",
  postcode: "Postcode",
  defaultPoNumber: "Default purchase order number",
};

/** Updates the organisation's details and records what changed. */
export async function updateProfile(db: TenantDb, organisationId: string, actor: Actor, input: ProfileInput) {
  assertCan(actor, "manageOrganisation");
  const clean = Object.fromEntries(
    (Object.keys(LIMITS) as (keyof ProfileInput)[]).map((k) => [k, (input[k] ?? "").trim().replace(/\s+/g, " ")]),
  ) as unknown as ProfileInput;
  const errors: Record<string, string> = {};
  if (!clean.name) errors.name = "Enter your organisation's name.";
  if (clean.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.billingEmail)) errors.billingEmail = "Enter an email address like accounts@company.co.bw.";
  for (const [k, max] of Object.entries(LIMITS)) {
    if (clean[k as keyof ProfileInput].length > max) errors[k] = `Keep this under ${max} characters.`;
  }
  const first = Object.keys(errors)[0];
  if (first) throw new DomainError("invalid", errors[first], first, errors);

  return db.$transaction(async (tx) => {
    const before = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    const data = Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, k === "name" ? v : v || null]));
    const changed = (Object.keys(LIMITS) as (keyof ProfileInput)[]).filter((k) => (before[k] ?? "") !== (clean[k] ?? ""));
    if (changed.length === 0) return;
    await tx.organisation.update({ where: { id: organisationId }, data });
    await audit(
      tx,
      customerAudit(actor, organisationId, {
        action: "organisation.updated",
        summary: `Changed ${changed.map((k) => LABELS[k].toLowerCase()).join(", ")}`,
        targetType: "Organisation",
        targetId: organisationId,
      }),
    );
  });
}
