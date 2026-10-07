"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { saveSecurityChecks, setConsent } from "@/server/licences/automation";
import { linkTenant, recordLicence, recordTenantUser } from "@/server/licences/licences";
import { finishOnboarding, saveOnboarding, tickStaffItem } from "@/server/licences/onboarding";

async function deps() {
  const { staff } = await requireStaff();
  return { db: prisma, staff };
}

function done(organisationId: string) {
  revalidatePath(`/admin/customers/${organisationId}`, "layout");
}

export async function linkTenantAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { vendor: field(form, "vendor"), primaryDomain: field(form, "primaryDomain"), vendorTenantId: field(form, "vendorTenantId") };
  const result = await run(async () => {
    await linkTenant(await deps(), organisationId, values);
    return "Linked. The customer can see it now.";
  }, values);
  if (result.ok) done(organisationId);
  return result;
}

export async function recordLicenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { sku: field(form, "sku"), name: field(form, "name"), purchased: field(form, "purchased") };
  const result = await run(async () => {
    const purchased = /^\d+$/.test(values.purchased.trim()) ? Number(values.purchased.trim()) : Number.NaN;
    await recordLicence(await deps(), organisationId, { tenantId: field(form, "tenantId"), sku: values.sku, name: values.name, purchased });
    return "Recorded.";
  }, values);
  if (result.ok) done(organisationId);
  return result;
}

export async function recordUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { name: field(form, "name"), email: field(form, "email") };
  const licenceIds = form.getAll("licenceIds").filter((v): v is string => typeof v === "string");
  const result = await run(async () => {
    await recordTenantUser(await deps(), organisationId, { tenantId: field(form, "tenantId"), ...values, licenceIds });
    return "Recorded.";
  }, values);
  if (result.ok) done(organisationId);
  return result;
}

export async function saveOnboardingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { kind: field(form, "kind"), verificationValue: field(form, "verificationValue"), partnerInviteUrl: field(form, "partnerInviteUrl") };
  const result = await run(async () => {
    await saveOnboarding(await deps(), organisationId, { tenantId: field(form, "tenantId"), ...values });
    return "Saved. The customer sees the steps on their Users and licences page.";
  }, values);
  if (result.ok) done(organisationId);
  return result;
}

export async function tickStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const result = await run(async () => void (await tickStaffItem(await deps(), organisationId, field(form, "onboardingId"), field(form, "key"), field(form, "done") === "yes")));
  if (result.ok) done(organisationId);
  return result;
}

export async function finishOnboardingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const result = await run(async () => {
    await finishOnboarding(await deps(), organisationId, field(form, "onboardingId"));
    return "Finished.";
  });
  if (result.ok) done(organisationId);
  return result;
}

// ─── Admin access and security settings (U6) ─────────────────────────

export async function setConsentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const granted = field(form, "granted") === "true";
  const result = await run(async () => {
    await setConsent(await deps(), organisationId, field(form, "tenantId"), granted);
    return granted ? "Recorded. The customer sees access as given." : "Recorded as not given.";
  });
  if (result.ok) done(organisationId);
  return result;
}

export async function saveChecksAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { checks: field(form, "checks") };
  const result = await run(async () => {
    await saveSecurityChecks(await deps(), organisationId, field(form, "tenantId"), values.checks);
    return "Saved. It counts in the customer's security score from tonight.";
  }, values);
  if (result.ok) done(organisationId);
  return result;
}
