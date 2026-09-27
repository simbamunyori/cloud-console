import type { PrismaClient } from "@prisma/client";
import { formatMoment } from "@/lib/dates";
import { formatMoney, fromJson, type MoneyJson } from "@/lib/domain/money";
import { company } from "@/config/app";
import { newToken, hashToken } from "@/server/auth/tokens";
import type { EmailBody } from "./layout";

/**
 * Every kind of email and how to write it. Each takes the payload stored
 * with the queued email and returns the subject and body at send time.
 */

export interface TemplateContext {
  db: PrismaClient;
  appUrl: string;
  consoleName: string;
  now: Date;
}

export type Rendered = { subject: string; body: EmailBody } | null;

type Template = (payload: Record<string, unknown>, ctx: TemplateContext) => Promise<Rendered>;

const TZ = "Africa/Gaborone";
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A device description short enough for an email, from the user agent. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "an unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "a browser";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iPhone or iPad"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "an unknown system";
  return `${browser} on ${os}`;
}

export const TEMPLATES: Record<string, Template> = {
  /** The link is made now, so only the newest email's link works and no link is ever stored. */
  async invitation(p, ctx) {
    const inv = await ctx.db.invitation.findUnique({
      where: { id: str(p.invitationId) },
      include: { organisation: true, invitedBy: { include: { user: true } } },
    });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= ctx.now) return null;
    const token = newToken();
    await ctx.db.invitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token) } });
    return {
      subject: `${inv.invitedBy.user.name} invited you to ${inv.organisation.name} on ${ctx.consoleName}`,
      body: {
        heading: `Join ${inv.organisation.name}`,
        paragraphs: [
          `${inv.invitedBy.user.name} invited you to manage ${inv.organisation.name}'s cloud services with ${company.name}.`,
          "You'll choose a password and set up an authenticator app. Every account uses one.",
        ],
        button: { label: "Accept the invitation", url: `${ctx.appUrl}/invite/${encodeURIComponent(token)}` },
        footnote: `The link works for 7 days, until ${formatMoment(inv.expiresAt, inv.organisation.timeZone)}. If you weren't expecting this, you can ignore it.`,
      },
    };
  },

  async "security.two_step_on"(p) {
    return {
      subject: "Two-step login is on for your account",
      body: {
        heading: "Two-step login is on",
        paragraphs: [
          "Your account now asks for a code from your authenticator app each time you sign in.",
          "Keep your backup codes somewhere safe. Each one lets you sign in once if you lose your phone.",
        ],
        footnote: `If this wasn't you, reply to this email or contact ${company.supportEmail} straight away.`,
        facts: [["When", formatMoment(new Date(str(p.at)), TZ)]],
      },
    };
  },

  async "security.new_sign_in"(p, ctx) {
    return {
      subject: "New sign-in to your account",
      body: {
        heading: "A new device signed in",
        paragraphs: ["Someone signed in to your account from a device we haven't seen before. If it was you, there's nothing to do."],
        facts: [
          ["When", formatMoment(new Date(str(p.at)), TZ)],
          ["Device", describeDevice(str(p.userAgent))],
          ["Address", str(p.ipAddress) || "Unknown"],
        ],
        button: { label: "Review your sign-ins", url: `${ctx.appUrl}/app/security` },
        footnote: "If it wasn't you, change your password and tell us straight away. Your password and code were both used.",
      },
    };
  },

  async "security.recovery_code_used"(p, ctx) {
    const left = Number(p.left ?? 0);
    return {
      subject: "A backup code was used to sign in",
      body: {
        heading: "A backup code was used",
        paragraphs: [
          `Someone signed in to your account with one of your backup codes. You have ${left} left.`,
          left <= 2 ? "You're running low. Make new ones from the Security page." : "Each code works once.",
        ],
        facts: [["When", formatMoment(new Date(str(p.at)), TZ)]],
        button: { label: "Open Security", url: `${ctx.appUrl}/app/security` },
      },
    };
  },

  async "security.locked"(p) {
    return {
      subject: "Sign-in paused after too many attempts",
      body: {
        heading: "Sign-in is paused for 15 minutes",
        paragraphs: [
          "There were several wrong attempts to sign in to your account, so we've paused sign-in for a short while.",
          "If this wasn't you, your password may be known to someone else. Your account is still protected by your authenticator code.",
        ],
        facts: [["Paused until", formatMoment(new Date(str(p.until)), TZ)]],
      },
    };
  },

  async "payment.confirmed"(p, ctx) {
    const amount = fromJson(p.amount as MoneyJson);
    return {
      subject: `Payment received for invoice ${str(p.invoiceNumber)}`,
      body: {
        heading: "Thank you, your payment is in",
        paragraphs: [`We've received your payment and applied it to invoice ${str(p.invoiceNumber)}.`],
        facts: [
          ["Amount", formatMoney(amount)],
          ["Paid by", str(p.method)],
          ["Invoice", str(p.invoiceNumber)],
        ],
        button: { label: "View the invoice", url: `${ctx.appUrl}/app/billing/invoices/${encodeURIComponent(str(p.invoiceId))}` },
      },
    };
  },
};

export function registerTemplate(kind: string, template: Template) {
  TEMPLATES[kind] = template;
}
