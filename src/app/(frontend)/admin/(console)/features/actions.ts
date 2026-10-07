"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { setFeature } from "@/server/features/features";

export async function setFeatureAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const enabled = field(form, "enabled") === "true";
  const result = await run(async () => {
    const { staff } = await requireStaffCan("manageFeatures");
    await setFeature({ db: prisma, staff }, field(form, "key"), enabled);
    return enabled ? "Turned on." : "Turned off.";
  });
  revalidatePath("/", "layout");
  return result;
}
