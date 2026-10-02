"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter } from "@/server/billing";
import { scopedBilling } from "@/server/billing/scoped";
import { prisma } from "@/server/db";
import { moveToOurServers, setHosting, setLegacyReview } from "@/server/migration/services";
import { DomainError } from "@/server/org/access";

async function serviceOf(organisationId: string, serviceId: string) {
  const billing = await scopedBilling(prisma, billingAdapter(), organisationId);
  const service = await billing.getService(serviceId);
  if (!service) throw new DomainError("not-found", "That service isn't on this account.");
  return service;
}

export async function setHostingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const organisationId = field(form, "organisationId");
  return run(async () => {
    const service = await serviceOf(organisationId, field(form, "serviceId"));
    await setHosting({ db: prisma, staff }, organisationId, service, { hostedAt: field(form, "hostedAt"), hostServer: field(form, "hostServer"), hostNotes: field(form, "hostNotes") });
    revalidatePath(`/admin/customers/${organisationId}`);
    return "Saved. Suspensions and cancellations in billing now become tasks.";
  });
}

export async function moveToOurServersAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const organisationId = field(form, "organisationId");
  return run(async () => {
    const service = await serviceOf(organisationId, field(form, "serviceId"));
    await moveToOurServers({ db: prisma, staff }, organisationId, service);
    revalidatePath(`/admin/customers/${organisationId}`);
    return "Moved. It is managed like any other service from now on.";
  });
}

export async function setReviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const organisationId = field(form, "organisationId");
  return run(async () => {
    await setLegacyReview({ db: prisma, staff }, organisationId, field(form, "serviceId"), field(form, "reviewOn"));
    revalidatePath(`/admin/customers/${organisationId}`);
    return "Saved.";
  });
}
