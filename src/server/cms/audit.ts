import { prisma } from "@/server/db";

/** Who did something in the website editor: the editor's own record of a staff member. */
export interface EditorUser {
  consoleUserId: string;
  name: string;
}

/** Records a website change in the staff audit log, as every other staff action is. */
export async function websiteAudit(user: EditorUser | null | undefined, action: string, summary: string, data?: Record<string, unknown>) {
  if (!user) return;
  await prisma.staffAuditEvent.create({
    data: { actorUserId: user.consoleUserId, actorLabel: user.name, action, summary, data: data as object | undefined },
  });
}
