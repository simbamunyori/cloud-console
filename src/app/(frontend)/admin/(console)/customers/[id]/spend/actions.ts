"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { addSaving } from "@/server/spend/tips";
import { linkSubscription } from "@/server/spend/usage";

async function deps() {
  const { staff } = await requireStaff();
  return { db: prisma, staff };
}

export async function linkSubscriptionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { subscriptionId: field(form, "subscriptionId"), name: field(form, "name"), margin: field(form, "margin") };
  const result = await run(async () => {
    await linkSubscription(await deps(), organisationId, values);
    return "Saved. Usage for it is matched on the next upload.";
  }, values);
  if (result.ok) revalidatePath(`/admin/customers/${organisationId}`, "layout");
  return result;
}

export async function addSavingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const values = { title: field(form, "title"), detail: field(form, "detail"), monthly: field(form, "monthly") };
  const result = await run(async () => {
    await addSaving(await deps(), organisationId, values);
    return "Added. The customer sees it under Cloud spend.";
  }, values);
  if (result.ok) revalidatePath(`/admin/customers/${organisationId}`, "layout");
  return result;
}
