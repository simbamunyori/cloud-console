"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter } from "@/server/billing";
import { prisma } from "@/server/db";
import { FIGURES, saveSuccessSettings, takeSnapshot } from "@/server/success/success";

export async function saveSuccessSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values: Record<string, string> = { directorEmails: field(form, "directorEmails"), ...Object.fromEntries(FIGURES.map((f) => [f.key, field(form, f.key)])) };
  const result = await run(async () => {
    const { staff } = await requireStaffCan("viewSuccess");
    await saveSuccessSettings({ db: prisma, staff }, { directorEmails: values.directorEmails, targets: values });
    return "Saved.";
  }, values);
  if (result.ok) revalidatePath("/admin/success");
  return result;
}

/** Takes this month's figures now rather than waiting for the night. */
export async function refreshSuccessAction(_prev: ActionState): Promise<ActionState> {
  const result = await run(async () => {
    await requireStaffCan("viewSuccess");
    await takeSnapshot(prisma, billingAdapter());
    return "Up to date.";
  });
  if (result.ok) revalidatePath("/admin/success");
  return result;
}
