import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requireActiveStaffSession } from "@/server/auth/next";
import { assertStaffCan, websiteRoleOf, type StaffActor, type StaffPermission } from "@/server/staff/access";

/**
 * Everything a staff page needs: the signed-in staff member and their
 * role. Staff sessions use their own cookie and never open customer pages.
 */
export const requireStaff = cache(async () => {
  const session = await requireActiveStaffSession();
  const { user } = session;
  if (user.kind !== "STAFF" || !user.staffRole || user.deactivatedAt) redirect("/admin/sign-in?expired=1");
  const staff: StaffActor = { userId: user.id, name: user.name, staffRole: user.staffRole };
  return { session, staff };
});

/** For a page only some staff roles may open. */
export async function requireStaffCan(permission: StaffPermission) {
  const ctx = await requireStaff();
  assertStaffCan(ctx.staff, permission);
  return ctx;
}

/** For pages only website Editors and Publishers open (launch kits, the newsletter). */
export async function requireWebsiteStaff() {
  const ctx = await requireStaff();
  const websiteRole = websiteRoleOf(ctx.session.user);
  if (!websiteRole) redirect("/admin");
  return { ...ctx, actor: { ...ctx.staff, websiteRole } };
}
