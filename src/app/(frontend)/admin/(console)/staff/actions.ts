"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { requireRecentCheck } from "@/server/auth/next";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { setWebsiteRole } from "@/server/staff/website-roles";

export async function setWebsiteRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, session } = await requireStaff();
  await requireRecentCheck(session, "STAFF", "/admin/staff");
  const result = await run(async () => {
    await setWebsiteRole(prisma, staff, field(form, "userId"), field(form, "websiteRole"));
  });
  if (result.ok) revalidatePath("/admin/staff");
  return result;
}
