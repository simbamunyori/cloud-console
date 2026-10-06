import { formatMoment } from "@/lib/dates";
import { company } from "@/config/app";
import { hashToken, newToken } from "@/server/auth/tokens";
import { STAFF_ROLE_LABEL, WEBSITE_ROLE_LABEL } from "@/server/staff/access";
import type { Template } from "./templates";

/** Emails about staff accounts (src/server/staff/invitations.ts). */

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const STAFF_TEMPLATES: Record<string, Template> = {
  /** Like customer invitations, the link is made now, so only the newest email's link works and no link is ever stored. */
  async "staff.invitation"(p, ctx) {
    const inv = await ctx.db.staffInvitation.findUnique({ where: { id: str(p.invitationId) }, include: { invitedBy: { select: { name: true } } } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= ctx.now) return null;
    const token = newToken();
    await ctx.db.staffInvitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token) } });
    const role = STAFF_ROLE_LABEL[inv.staffRole];
    return {
      subject: `${inv.invitedBy.name} invited you to the ${company.name} staff console`,
      body: {
        heading: "Set up your staff account",
        paragraphs: [
          `${inv.invitedBy.name} invited you to the ${company.name} staff console as ${role} staff.`,
          "You'll choose your name and password, then set up an authenticator app. Every staff account uses one.",
        ],
        facts: [
          ["Email", inv.email],
          ["Role", role],
          ...(inv.staffRole !== "ADMIN" && inv.websiteRole ? ([["Website", WEBSITE_ROLE_LABEL[inv.websiteRole]]] as [string, string][]) : []),
        ],
        button: { label: "Set up my account", url: `${ctx.appUrl}/admin/invite/${encodeURIComponent(token)}` },
        footnote: `The link works for 7 days, until ${formatMoment(inv.expiresAt, ctx.timeZone)}. If you weren't expecting this, you can ignore it.`,
      },
    };
  },

  /** To whoever sent the invitation, once the colleague has finished setting up. */
  async "staff.ready"(p, ctx) {
    const inv = await ctx.db.staffInvitation.findUnique({ where: { id: str(p.invitationId) }, include: { user: { select: { name: true, email: true } } } });
    if (!inv?.user || !inv.readyAt) return null;
    return {
      subject: `${inv.user.name} has set up their staff account`,
      body: {
        heading: `${inv.user.name.split(" ")[0]} is ready`,
        paragraphs: [`${inv.user.name} accepted your invitation and finished setting up their staff account, authenticator app included. They can sign in to the staff console now.`],
        facts: [
          ["Name", inv.user.name],
          ["Email", inv.user.email],
          ["Role", STAFF_ROLE_LABEL[inv.staffRole]],
          ["Ready", formatMoment(inv.readyAt, ctx.timeZone)],
        ],
        button: { label: "Open Staff", url: `${ctx.appUrl}/admin/staff` },
      },
    };
  },
};
