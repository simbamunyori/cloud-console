import { company } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { hashToken, newToken } from "@/server/auth/tokens";
import type { Template } from "./templates";

/**
 * Emails for clients brought over from Odoo (Milestone 9b): the welcome on
 * the cutover date, and staff reminders for work on services hosted
 * elsewhere.
 */

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const MIGRATION_TEMPLATES: Record<string, Template> = {
  /** The password link is made now, as for a password reset, and only its hash is kept. */
  async "migration.welcome"(p, ctx) {
    const org = await ctx.db.organisation.findUnique({ where: { id: str(p.organisationId) }, select: { name: true } });
    if (!org) return null;
    const resetId = str(p.resetId);
    let button = { label: "Sign in", url: `${ctx.appUrl}/sign-in` };
    let footnote = "Sign in with your email and password as usual. Questions? Reply to this email.";
    if (resetId) {
      const reset = await ctx.db.passwordReset.findUnique({ where: { id: resetId } });
      if (reset && !reset.usedAt && reset.expiresAt > ctx.now) {
        const token = newToken();
        await ctx.db.passwordReset.update({ where: { id: reset.id }, data: { tokenHash: hashToken(token) } });
        button = { label: "Choose your password", url: `${ctx.appUrl}/reset-password/${encodeURIComponent(token)}` };
        footnote = `The link works once, until ${formatMoment(reset.expiresAt, ctx.timeZone)}. After that, use "Forgot password?" on the sign-in page. Questions? Reply to this email.`;
      } else {
        footnote = `Use "Forgot password?" on the sign-in page to choose a password. Questions? Reply to this email.`;
      }
    }
    return {
      subject: `${org.name}'s account is ready on ${company.name} ${ctx.consoleName}`,
      body: {
        heading: "Your account is ready",
        paragraphs: [
          `We've moved ${org.name}'s account with ${company.name} to the ${ctx.consoleName}. Your services, domains and anything still owed are already there.`,
          "You pay the same prices as before, and your next invoices fall due on the same dates. Nothing needs to change on your side.",
          "From now on you can see your invoices and pay them, change the number of users and ask for help in one place. The first time you sign in, you'll also set up an authenticator app or a passkey to keep the account safe.",
        ],
        button,
        footnote,
      },
    };
  },

  async "task.reminder"(p, ctx) {
    const task = await ctx.db.provisioningTask.findUnique({ where: { id: str(p.taskId) }, include: { organisation: { select: { name: true } } } });
    if (!task || (task.status !== "OPEN" && task.status !== "IN_PROGRESS")) return null;
    return {
      subject: `Still to do: ${task.title}`,
      body: {
        heading: "A task is late",
        paragraphs: [`${task.title}, for ${task.organisation.name}, was due by ${formatMoment(task.expectedBy, ctx.timeZone)}.`, ...task.instructions.split("\n").filter((l) => l.trim())],
        button: { label: "Open the setup queue", url: `${ctx.appUrl}/admin/tasks` },
        footnote: "You'll get this once a day until the task is marked done.",
      },
    };
  },
};
