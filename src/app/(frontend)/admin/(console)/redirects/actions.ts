"use server";

import { revalidatePath } from "next/cache";
import { requireWebsiteStaff } from "@/server/admin/context";
import { removeRedirect, saveRedirect } from "@/server/admin/redirects";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";

export async function saveRedirectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const values = { fromPath: field(form, "fromPath"), toPath: field(form, "toPath") };
  const markets = (await prisma.market.findMany({ select: { code: true } })).map((m) => m.code);
  const result = await run(async () => {
    const row = await saveRedirect(prisma, actor, values, markets);
    return `Saved. ${row.fromPath} now goes to ${row.toPath}.`;
  }, values);
  revalidatePath("/admin/redirects");
  return result;
}

export async function removeRedirectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const result = await run(async () => {
    await removeRedirect(prisma, actor, field(form, "id"));
    return "Removed.";
  });
  revalidatePath("/admin/redirects");
  return result;
}
