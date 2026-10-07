"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { PRIORITIES, routeQueue, saveTarget, setStaffUnits } from "@/server/units/units";

export async function setUnitsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await setStaffUnits({ db: prisma, staff }, field(form, "userId"), form.getAll("units").map(String));
    return "Saved.";
  });
  if (result.ok) revalidatePath("/admin/units");
  return result;
}

export async function routeQueueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await routeQueue({ db: prisma, staff }, field(form, "queue"), field(form, "unit"));
    return "Saved.";
  });
  if (result.ok) revalidatePath("/admin/units");
  return result;
}

/** One unit's targets for every priority, saved together. */
export async function saveTargetsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const unit = field(form, "unit");
  const values = Object.fromEntries(PRIORITIES.flatMap((p) => [`${p}-first`, `${p}-resolve`].map((k) => [k, field(form, k)])));
  const result = await run(async () => {
    const { staff } = await requireStaff();
    const fieldErrors: Record<string, string> = {};
    for (const p of PRIORITIES) {
      try {
        await saveTarget({ db: prisma, staff }, { unit, priority: p, firstResponse: values[`${p}-first`], resolve: values[`${p}-resolve`] });
      } catch (e) {
        if (!(e instanceof DomainError) || !e.fieldErrors) throw e;
        for (const [k, v] of Object.entries(e.fieldErrors)) fieldErrors[`${p}-${k === "firstResponse" ? "first" : "resolve"}`] = v;
      }
    }
    if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted targets. The others are saved.", undefined, fieldErrors);
    return "Targets saved.";
  }, values);
  if (result.ok) revalidatePath("/admin/units");
  return result;
}
