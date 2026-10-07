"use server";

import { revalidatePath } from "next/cache";
import { toDateOnly, todayIn } from "@/lib/dates";
import { field, run, type ActionState } from "@/server/action-state";
import { activeBackupProvider, customerBackupOn, requestRestore } from "@/server/backup/backup";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { requireMember } from "@/server/org/context";

export async function requestRestoreAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { protectionId: field(form, "protectionId"), what: field(form, "what"), fromDay: field(form, "fromDay"), destination: field(form, "destination") };
  const result = await run(async () => {
    const { db, actor, organisation, market } = await requireMember();
    if (!(await customerBackupOn(prisma))) throw new DomainError("not-found", "Backup isn't available yet.");
    const request = await requestRestore({ db, actor, organisation, provider: await activeBackupProvider(prisma), today: toDateOnly(todayIn(market.timeZone)) }, values);
    return request.status === "IN_PROGRESS" ? "Your restore has started. We'll let you know when it's done." : "Thanks. Our team will start your restore and let you know when it's done.";
  }, values);
  revalidatePath("/app/backup");
  return result;
}
