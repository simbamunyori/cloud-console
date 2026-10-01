"use server";

import { revalidatePath } from "next/cache";
import { run, field, type ActionState } from "@/server/action-state";
import { requireRecentCheck } from "@/server/auth/next";
import { runSoon } from "@/server/jobs/boss";
import { requireMember } from "@/server/org/context";
import { inviteMember, resendInvitation, revokeInvitation, updateMember } from "@/server/org/members";

export async function inviteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor, session } = await requireMember();
  await requireRecentCheck(session, "CUSTOMER", "/app/team");
  const values = { email: field(form, "email"), role: field(form, "role") };
  const result = await run(async () => {
    await inviteMember(db, organisation.id, actor, values);
    return `Invitation sent to ${values.email.trim().toLowerCase()}.`;
  }, values);
  if (result.ok) {
    await runSoon("email-deliver").catch(() => undefined);
    revalidatePath("/app/team");
  }
  return result;
}

export async function resendAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  const result = await run(async () => {
    await resendInvitation(db, organisation.id, actor, field(form, "invitationId"));
    return "Sent again. The earlier link no longer works.";
  });
  if (result.ok) {
    await runSoon("email-deliver").catch(() => undefined);
    revalidatePath("/app/team");
  }
  return result;
}

export async function revokeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor, session } = await requireMember();
  await requireRecentCheck(session, "CUSTOMER", "/app/team");
  const result = await run(async () => {
    await revokeInvitation(db, organisation.id, actor, field(form, "invitationId"));
    return "Invitation withdrawn.";
  });
  if (result.ok) revalidatePath("/app/team");
  return result;
}

export async function updateMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor, session } = await requireMember();
  await requireRecentCheck(session, "CUSTOMER", "/app/team");
  const remove = field(form, "intent") === "remove";
  const result = await run(async () => {
    await updateMember(db, organisation.id, actor, field(form, "membershipId"), { role: field(form, "role"), active: !remove });
    return remove ? "Removed from the team. They've been signed out." : "Role changed.";
  });
  if (result.ok) revalidatePath("/app/team");
  return result;
}
