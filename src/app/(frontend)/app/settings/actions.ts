"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { requireMember } from "@/server/org/context";
import { updateProfile, type ProfileInput } from "@/server/org/organisation";

const KEYS: (keyof ProfileInput)[] = [
  "name",
  "registrationNumber",
  "vatNumber",
  "billingEmail",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "postcode",
  "defaultPoNumber",
];

export async function updateProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  const values = Object.fromEntries(KEYS.map((k) => [k, field(form, k)])) as unknown as ProfileInput;
  const result = await run(async () => {
    await updateProfile(db, organisation.id, actor, values);
    return "Saved.";
  }, values as unknown as Record<string, string>);
  if (result.ok) revalidatePath("/app", "layout");
  return result;
}
