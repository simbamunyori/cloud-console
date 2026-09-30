"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { openIncident, resolveIncident, updateIncident } from "@/server/status/status";

function refresh() {
  revalidatePath("/admin/status");
  // Every public page shows the status in its top strip.
  revalidatePath("/", "layout");
}

export async function openIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { title: field(form, "title"), impact: field(form, "impact"), message: field(form, "message") };
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await openIncident(prisma, staff, values);
    return "Posted. The site now shows it.";
  }, values);
  refresh();
  return result;
}

export async function updateIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await updateIncident(prisma, staff, field(form, "id"), field(form, "message"));
    return "Updated.";
  });
  refresh();
  return result;
}

export async function resolveIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await resolveIncident(prisma, staff, field(form, "id"));
    return "Resolved.";
  });
  refresh();
  return result;
}
