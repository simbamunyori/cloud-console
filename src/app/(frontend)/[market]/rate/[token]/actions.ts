"use server";

import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { rateTicket } from "@/server/support/tickets";

export async function rateByLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { score: field(form, "score"), comment: field(form, "comment") };
  return run(async () => {
    await rateTicket(prisma, { token: field(form, "token") }, { score: Number(values.score), comment: values.comment });
    return "Thank you. Your answer helps us get better.";
  }, values);
}
