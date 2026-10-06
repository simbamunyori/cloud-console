"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { saveContactCard } from "@/server/experience/experience";

export async function saveContactCardAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const values = { jobTitle: field(form, "jobTitle"), phone: field(form, "phone") };
  return run(async () => {
    await saveContactCard({ db: prisma, staff }, values);
    revalidatePath("/admin/my-work");
    return "Saved. Customers you look after see this on their home page.";
  }, values);
}
