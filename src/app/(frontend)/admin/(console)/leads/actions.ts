"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { setLeadStatus } from "@/server/sales/leads";

const STATUSES = { NEW: "Back to new.", CONTACTED: "Marked contacted.", CLOSED: "Closed." } as const;

export async function setLeadStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("viewCustomers");
  const status = field(form, "status") as keyof typeof STATUSES;
  if (!(status in STATUSES)) return { error: "Choose a status." };
  const result = await run(async () => {
    await setLeadStatus(prisma, staff, field(form, "reference"), status);
    return STATUSES[status];
  });
  revalidatePath("/admin/leads", "layout");
  return result;
}
