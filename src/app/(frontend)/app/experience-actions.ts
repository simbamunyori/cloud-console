"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionState } from "@/server/action-state";
import { requireMember } from "@/server/org/context";
import { prisma } from "@/server/db";
import { dismissWelcome } from "@/server/experience/experience";

export async function hideWelcomeAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const { actor, organisation } = await requireMember();
  return run(async () => {
    await dismissWelcome({ db: prisma, actor }, organisation.id);
    revalidatePath("/app");
  });
}
