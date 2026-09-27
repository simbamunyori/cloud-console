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
        footnote: "If this wasn't you, reply to this email straight away.",
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

  async "order.received"(p, ctx) {
    const order = await ctx.db.order.findUnique({ where: { id: str(p.orderId) }, include: { product: true, organisation: true } });
    if (!order) return null;
    const isDomain = order.monthlyTotalMinor === 0n && order.product.slug === "domain-name";
    const opts = (order.options ?? {}) as Record<string, string>;
    const what = isDomain ? opts.Domain : order.product.name;
    return {
      subject: `We're setting up ${what} (${order.reference})`,
      body: {
        heading: `Thanks, we're setting up ${what}`,
        paragraphs: [
          `Your order for ${order.organisation.name} is in. We'll email you again when it's ready, and you can follow it in ${ctx.consoleName} at any time.`,
          "The invoice for it is in Billing. Pay it by card or bank transfer whenever suits you before it's due.",
        ],
        facts: [
          ["Order", order.reference],
          ...(order.quantity > 1 ? ([["Quantity", String(order.quantity)]] as [string, string][]) : []),
          [isDomain ? "Price" : "Price a month", formatMoney({ amountMinor: isDomain ? order.unitPriceMinor : order.monthlyTotalMinor, currency: order.currency })],
          ["Expected by", formatMoment(order.expectedBy, order.organisation.timeZone)],
        ],
        button: { label: "Follow your order", url: `${ctx.appUrl}/app/orders/${encodeURIComponent(order.reference)}` },
      },
    };
  },
  async "order.ready"(p, ctx) {
    const order = await ctx.db.order.findUnique({ where: { id: str(p.orderId) }, include: { product: true, organisation: true } });
    if (!order) return null;
    const opts = (order.options ?? {}) as Record<string, string>;
    const what = order.product.slug === "domain-name" ? opts.Domain : order.product.name;
    return {
      subject: `${what} is ready (${order.reference})`,
      body: {
        heading: `${what} is ready`,
        paragraphs: [`We've finished setting up ${what} for ${order.organisation.name}.`, ...(str(p.note) ? [str(p.note)] : [])],
        facts: [["Order", order.reference]],
        button: { label: "Open your services", url: `${ctx.appUrl}/app/services` },
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
  async "payment.eft_not_found"(p, ctx) {
    const amount = fromJson(p.amount as MoneyJson);
    return {
      subject: `We couldn't find your payment for invoice ${str(p.invoiceNumber)}`,
      body: {
        heading: "We couldn't match your bank transfer",
        paragraphs: [
          `You told us you paid ${formatMoney(amount)} for invoice ${str(p.invoiceNumber)}, but we can't see it in our bank account yet.`,
          `Our team says: ${str(p.note)}`,
          "If you've checked and it went through, reply to this email with proof of payment and we'll look again.",
        ],
        facts: [
          ["Invoice", str(p.invoiceNumber)],
          ["Amount", formatMoney(amount)],
        ],
        button: { label: "View the invoice", url: `${ctx.appUrl}/app/billing/invoices/${encodeURIComponent(str(p.invoiceId))}` },
      },
    };
  },
  /** The reply itself isn't in the email: it may hold account details, so it's read after signing in. */
  async "ticket.reply"(p, ctx) {
    const ticket = await ctx.db.ticket.findUnique({ where: { id: str(p.ticketId) } });
    if (!ticket || ticket.deletedAt) return null;
    return {
      subject: `We've replied to ${ticket.reference}: ${ticket.subject}`,
      body: {
        heading: "We've replied to your question",
        paragraphs: [`Our team has answered "${ticket.subject}". Sign in to read the reply and answer if you need to.`],
        facts: [["Ticket", ticket.reference]],
        button: { label: "Read the reply", url: `${ctx.appUrl}/app/support/tickets/${encodeURIComponent(ticket.reference)}` },
      },
    };
  },
};

export function registerTemplate(kind: string, template: Template) {
  TEMPLATES[kind] = template;
}
