"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { linkTenant, recordLicence, recordTenantUser } from "@/server/licences/licences";

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
