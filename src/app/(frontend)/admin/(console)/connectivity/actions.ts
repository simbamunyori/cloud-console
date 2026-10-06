"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { saveLicence } from "@/server/connectivity/connectivity";
import { prisma } from "@/server/db";

export async function saveLicenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const market = field(form, "market");
  const remove = field(form, "remove") === "1";
  const values = { regulator: field(form, "regulator"), reference: field(form, "reference"), grantedOn: field(form, "grantedOn") };
  const result = await run(async () => {
    const { staff } = await requireStaffCan("manageCompany");
    await saveLicence({ db: prisma, staff }, market, { ...values, remove });
    return remove ? "Removed." : "Saved.";
  }, values);
  if (result.ok) revalidatePath("/admin/connectivity");
  return result;
}
