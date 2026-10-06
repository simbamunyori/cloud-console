"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { requireRecentCheck } from "@/server/auth/next";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { inviteStaff, resendStaffInvitation, revokeStaffInvitation, updateStaff } from "@/server/staff/invitations";
import { setWebsiteRole } from "@/server/staff/website-roles";

export async function setWebsiteRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, session } = await requireStaff();
  await requireRecentCheck(session, "STAFF", "/admin/staff");
  const result = await run(async () => {
    await setWebsiteRole(prisma, staff, field(form, "userId"), field(form, "websiteRole"));
  });
  if (result.ok) revalidatePath("/admin/staff");
  return result;
}

export async function inviteStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, session } = await requireStaff();
  await requireRecentCheck(session, "STAFF", "/admin/staff");
  const values = { email: field(form, "email"), staffRole: field(form, "staffRole"), websiteRole: field(form, "websiteRole") };
  const result = await run(async () => {
    await inviteStaff(prisma, staff, values);
    return `Invitation sent to ${values.email.trim().toLowerCase()}. You'll get an email when they've finished setting up.`;
  }, values);
  if (result.ok) {
    await runSoon("email-deliver").catch(() => undefined);
    revalidatePath("/admin/staff");
  }
  return result;
}

export async function resendStaffInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const result = await run(async () => {
    await resendStaffInvitation(prisma, staff, field(form, "invitationId"));
    return "Sent again. The earlier link no longer works.";
  });
  if (result.ok) {
    await runSoon("email-deliver").catch(() => undefined);
    revalidatePath("/admin/staff");
  }
  return result;
}

export async function revokeStaffInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, session } = await requireStaff();
  await requireRecentCheck(session, "STAFF", "/admin/staff");
  const result = await run(async () => {
    await revokeStaffInvitation(prisma, staff, field(form, "invitationId"));
    return "Invitation withdrawn.";
  });
  if (result.ok) revalidatePath("/admin/staff");
  return result;
}

export async function updateStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, session } = await requireStaff();
  await requireRecentCheck(session, "STAFF", "/admin/staff");
  const intent = field(form, "intent");
  const active = intent !== "deactivate";
  const result = await run(async () => {
    await updateStaff(prisma, staff, field(form, "userId"), { staffRole: field(form, "staffRole"), active });
    return intent === "deactivate" ? "Deactivated. They've been signed out." : intent === "reactivate" ? "Turned back on." : "Role changed.";
  });
  if (result.ok) revalidatePath("/admin/staff");
  return result;
}
