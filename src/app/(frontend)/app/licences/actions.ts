"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { requestLicenceChange, type ChangeInput } from "@/server/licences/licences";
import { tenantProvider } from "@/server/licences/provider";
import { requireMember } from "@/server/org/context";

const DONE: Record<ChangeInput["kind"], string> = {
  ASSIGN: "Licence given.",
  UNASSIGN: "Licence taken back. It's free for someone else.",
  ADD_USER: "Added.",
  REMOVE_USER: "Removed, and their licences are free.",
};

const ASKED = "Sent to our team. You'll see it here once it's done.";

async function submit(input: ChangeInput, values?: Record<string, string>): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  const result = await run(async () => {
    const { applied } = await requestLicenceChange(db, { organisationId: organisation.id, organisationName: organisation.name, actor, provider: tenantProvider() }, input);
    return applied ? DONE[input.kind] : ASKED;
  }, values);
  if (result.ok) {
    revalidatePath("/app/licences");
    revalidatePath("/app");
  }
  return result;
}

/** Give or take back one licence, or remove the person: which one is the button pressed. */
export async function changeLicenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const intent = field(form, "intent");
  const tenantUserId = field(form, "tenantUserId");
  if (intent === "remove") return submit({ kind: "REMOVE_USER", tenantUserId });
  const [kind, licenceId] = intent.split(":");
  return submit({ kind: kind === "take" ? "UNASSIGN" : "ASSIGN", tenantUserId, licenceId });
}

export async function addPersonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { name: field(form, "name"), email: field(form, "email"), licenceId: field(form, "licenceId") };
  return submit({ kind: "ADD_USER", tenantId: field(form, "tenantId"), name: values.name, email: values.email, licenceId: values.licenceId || undefined }, values);
}
