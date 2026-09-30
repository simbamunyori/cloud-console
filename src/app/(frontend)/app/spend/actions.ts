"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { requireMember } from "@/server/org/context";
import { askForSaving, dismissSaving } from "@/server/spend/tips";

/** Ask us to make a saving, or hide it: which one is the button pressed. */
export async function savingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  const ctx = { organisationId: organisation.id, organisationName: organisation.name, actor };
  const tipId = field(form, "tipId");
  const result = await run(async () => {
    if (field(form, "intent") === "dismiss") {
      await dismissSaving(db, ctx, tipId);
      return "Hidden. It won't count towards your savings.";
    }
    await askForSaving(db, ctx, tipId);
    return "Sent to our team. We'll check with you before anything is removed.";
  });
  if (result.ok) {
    revalidatePath("/app/spend");
    revalidatePath("/app");
  }
  return result;
}
