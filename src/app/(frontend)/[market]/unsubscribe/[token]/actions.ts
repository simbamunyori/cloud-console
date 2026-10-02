"use server";

import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { unsubscribeLead } from "@/server/leads/capture";

export async function stopEmailsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await unsubscribeLead(prisma, field(form, "token"));
    return "Done. We won't send you any more of these emails.";
  });
}
