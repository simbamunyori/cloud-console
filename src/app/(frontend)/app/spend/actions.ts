"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { requireMember } from "@/server/org/context";
import { setBudget } from "@/server/spend/budgets";
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

export async function budgetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  const values = { budget: field(form, "budget") };
  const result = await run(async () => {
    const saved = await setBudget(db, { organisationId: organisation.id, actor, locale: organisation.locale }, field(form, "subscriptionId"), values.budget);
    return saved.budgetMinor === null ? "Budget removed." : "Budget saved. We'll warn you by email as usage gets close.";
  }, values);
  if (result.ok) revalidatePath("/app/spend");
  return result;
}
