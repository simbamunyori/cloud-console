import type { PrismaClient } from "@prisma/client";
import { formatLongDate, formatMoment, formatMonth } from "@/lib/dates";
import { formatMoney, fromJson, type MoneyJson } from "@/lib/domain/money";
import { company } from "@/config/app";
import { newToken, hashToken } from "@/server/auth/tokens";
import { issueEmail } from "@/server/newsletter/issues";
import { newConfirmLink } from "@/server/newsletter/newsletter";
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
  /** The recipient's market's way of writing amounts, e.g. "en-ZA". */
  locale: string;
  /** The recipient's organisation's time zone. */
  timeZone: string;
}

export type Rendered = { subject: string; body: EmailBody; headers?: Record<string, string> } | null;

type Template = (payload: Record<string, unknown>, ctx: TemplateContext) => Promise<Rendered>;

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

  /** Like invitations, the link is made now and only its hash is kept. */
  async "auth.password_reset"(p, ctx) {
    const reset = await ctx.db.passwordReset.findUnique({ where: { id: str(p.resetId) } });
    if (!reset || reset.usedAt || reset.expiresAt <= ctx.now) return null;
    const token = newToken();
    await ctx.db.passwordReset.update({ where: { id: reset.id }, data: { tokenHash: hashToken(token) } });
    return {
      subject: `Choose a new password for ${ctx.consoleName}`,
      body: {
        heading: "Choose a new password",
        paragraphs: [
          "Someone asked to reset the password for your account. If it was you, use the button below. The link works once.",
          "You'll still need the code from your authenticator app to sign in afterwards.",
        ],
        button: { label: "Choose a new password", url: `${ctx.appUrl}/reset-password/${encodeURIComponent(token)}` },
        footnote: `The link works for 30 minutes, until ${formatMoment(reset.expiresAt, ctx.timeZone)}. If you didn't ask for this, you can ignore it; your password hasn't changed.`,
      },
    };
  },

  async "security.password_changed"(p, ctx) {
    return {
      subject: "Your password was changed",
      body: {
        heading: "Your password was changed",
        paragraphs: ["The password for your account was changed using a link we emailed you, and every device was signed out."],
        facts: [
          ["When", formatMoment(new Date(str(p.at)), ctx.timeZone)],
          ["Device", describeDevice(str(p.userAgent))],
          ["Address", str(p.ipAddress) || "Unknown"],
        ],
        footnote: "If this wasn't you, reply to this email straight away. Your account is still protected by your authenticator code.",
      },
    };
  },

  async "security.two_step_on"(p, ctx) {
    return {
      subject: "Two-step login is on for your account",
      body: {
        heading: "Two-step login is on",
        paragraphs: [
          "Your account now asks for a code from your authenticator app each time you sign in.",
          "Keep your backup codes somewhere safe. Each one lets you sign in once if you lose your phone.",
        ],
        footnote: "If this wasn't you, reply to this email straight away.",
        facts: [["When", formatMoment(new Date(str(p.at)), ctx.timeZone)]],
      },
    };
  },

  async "security.sign_in_method_added"(p, ctx) {
    return {
      subject: `${str(p.what)} was added to your sign-in`,
      body: {
        heading: `${str(p.what)} was added`,
        paragraphs: [`You can now sign in to your account with ${str(p.what)}.`],
        facts: [["When", formatMoment(new Date(str(p.at)), ctx.timeZone)]],
        footnote: "If this wasn't you, reply to this email straight away, and remove it on the Security page.",
      },
    };
  },

  async "security.sign_in_method_removed"(p, ctx) {
    return {
      subject: `${str(p.what)} was removed from your sign-in`,
      body: {
        heading: `${str(p.what)} was removed`,
        paragraphs: [`${str(p.what)} no longer signs in to your account.`],
        facts: [["When", formatMoment(new Date(str(p.at)), ctx.timeZone)]],
        footnote: "If this wasn't you, reply to this email straight away.",
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
          ["When", formatMoment(new Date(str(p.at)), ctx.timeZone)],
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
        facts: [["When", formatMoment(new Date(str(p.at)), ctx.timeZone)]],
        button: { label: "Open Security", url: `${ctx.appUrl}/app/security` },
      },
    };
  },

  async "security.locked"(p, ctx) {
    return {
      subject: "Sign-in paused after too many attempts",
      body: {
        heading: "Sign-in is paused for 15 minutes",
        paragraphs: [
          "There were several wrong attempts to sign in to your account, so we've paused sign-in for a short while.",
          "If this wasn't you, your password may be known to someone else. Your account is still protected by your authenticator code.",
        ],
        facts: [["Paused until", formatMoment(new Date(str(p.until)), ctx.timeZone)]],
      },
    };
  },

  async "lead.new"(p, ctx) {
    const lead = await ctx.db.lead.findUnique({ where: { id: str(p.leadId) } });
    if (!lead) return null;
    return {
      subject: `${lead.source === "PERSON" ? "Talk to a person" : "Follow-up request"} from ${lead.company ?? lead.name} (${lead.reference})`,
      body: {
        heading: lead.source === "PERSON" ? "A visitor wants to talk to a person" : "A visitor asked us to get back to them",
        paragraphs: [`${lead.name}${lead.company ? ` of ${lead.company}` : ""} left their details in a chat with Thapelo. The whole conversation is on the lead.`],
        facts: [
          ["Reference", lead.reference],
          ["Email", lead.email],
          ["Phone", lead.phone ?? "None"],
          ["Market", lead.market],
          ["What they need", lead.need],
        ],
        button: { label: "Open the lead", url: `${ctx.appUrl}/admin/leads/${encodeURIComponent(lead.reference)}` },
      },
    };
  },

  async "lead.received"(p, ctx) {
    const lead = await ctx.db.lead.findUnique({ where: { id: str(p.leadId) } });
    if (!lead) return null;
    return {
      subject: "We'll be in touch",
      body: {
        heading: "Thanks for getting in touch",
        paragraphs: [
          "Someone from our team will contact you, usually within one working day.",
          "We keep your details and your conversation with Thapelo for 12 months so we can help you, and then delete them. Reply to this email if you'd like them deleted sooner.",
        ],
        facts: [
          ["Reference", lead.reference],
          ["What you asked about", lead.need],
        ],
      },
    };
  },

  async "quote.requested"(p, ctx) {
    const quote = await ctx.db.quote.findUnique({ where: { id: str(p.quoteId) }, include: { product: { select: { name: true } } } });
    if (!quote) return null;
    return {
      subject: `We've got your request for a quote (${quote.reference})`,
      body: {
        heading: `Thanks, ${quote.name.split(" ")[0]}`,
        paragraphs: [
          `We'll look at what you need and email you a quote. If anything is unclear we'll call you on ${quote.phone ?? "the number you gave"}.`,
          `You don't need an account to ask. You'll only need one to accept the quote.`,
        ],
        facts: [
          ["Reference", quote.reference],
          ...(quote.product ? ([["About", quote.product.name]] as [string, string][]) : []),
          ["What you need", quote.need],
        ],
        footnote: "Reply to this email if you'd like to add anything.",
      },
    };
  },

  /** Double opt-in: nothing else is ever sent until this link is used. The link is made now; only its hash is kept. */
  async "newsletter.confirm"(p, ctx) {
    const link = await newConfirmLink(ctx.db, str(p.subscriberId), ctx.appUrl);
    if (!link) return null;
    return {
      subject: `Confirm your monthly insights email from ${company.name}`,
      body: {
        heading: "Confirm your subscription",
        paragraphs: [
          "You asked for our monthly insights email: practical advice on security, backup and running your business online.",
          "Confirm below and we'll send it once a month. Nothing is sent until you do.",
        ],
        button: { label: "Confirm my subscription", url: link.url },
        footnote: `The link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us. To make sure we never email this address, use ${link.unsubscribe}`,
      },
    };
  },

  /** The monthly newsletter, one copy per subscriber, with one-click unsubscribe (RFC 8058). */
  async "newsletter.issue"(p, ctx) {
    const e = await issueEmail(ctx.db, ctx.appUrl, str(p.issueId), str(p.subscriberId));
    if (!e) return null;
    return {
      subject: e.subject,
      headers: e.headers,
      body: {
        heading: e.heading,
        paragraphs: e.intro ? [e.intro] : [],
        items: e.items,
        button: { label: "See every insight", url: e.more },
        footnote: `You get this because you asked for our monthly insights email. Unsubscribe at any time: ${e.unsubscribe}`,
      },
    };
  },

  /** To the market's support address, so a new request is seen. */
  async "quote.new_request"(p, ctx) {
    const quote = await ctx.db.quote.findUnique({ where: { id: str(p.quoteId) }, include: { product: { select: { name: true } }, organisation: { select: { name: true } } } });
    if (!quote) return null;
    return {
      subject: `New quote request from ${quote.company ?? quote.name} (${quote.reference})`,
      body: {
        heading: "A new quote request",
        paragraphs: [`${quote.name}${quote.company ? ` of ${quote.company}` : ""} asked for a quote. Price it in the Quotes queue.`],
        facts: [
          ["Reference", quote.reference],
          ["Email", quote.email],
          ["Phone", quote.phone ?? "None"],
          ["Country", quote.country],
          ...(quote.organisation ? ([["Account", quote.organisation.name]] as [string, string][]) : []),
          ...(quote.product ? ([["About", quote.product.name]] as [string, string][]) : []),
          ["What they need", quote.need],
        ],
        button: { label: "Open the quote", url: `${ctx.appUrl}/admin/quotes/${encodeURIComponent(quote.reference)}` },
      },
    };
  },

  /** Like invitations, the link is made now and only its hash is kept, so only the newest email's link works. */
  async "quote.sent"(p, ctx) {
    const quote = await ctx.db.quote.findUnique({ where: { id: str(p.quoteId) }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    if (!quote || quote.status !== "SENT" || !quote.validUntil) return null;
    const market = await ctx.db.market.findUnique({ where: { code: quote.market } });
    if (!market) return null;
    const token = newToken();
    await ctx.db.quote.update({ where: { id: quote.id }, data: { tokenHash: hashToken(token) } });
    const fmt = (minor: bigint) => formatMoney({ amountMinor: minor, currency: market.currency }, market.locale);
    let monthly = 0n;
    let once = 0n;
    for (const l of quote.lines) {
      const amount = l.unitPriceMinor * BigInt(l.quantity);
      if (l.kind === "MONTHLY") monthly += amount;
      else once += amount;
    }
    const lines = quote.lines.map((l): [string, string] => [
      `${l.description}${l.quantity > 1 ? ` (${l.quantity})` : ""}`,
      `${fmt(l.unitPriceMinor * BigInt(l.quantity))}${l.kind === "MONTHLY" ? " a month" : " once"}`,
    ]);
    const until = formatLongDate(quote.validUntil);
    return {
      subject: `Your quote from ${company.name} (${quote.reference})`,
      body: {
        heading: `Your quote, ${quote.name.split(" ")[0]}`,
        paragraphs: [
          ...(quote.message ? [quote.message] : []),
          `Open the quote to accept it. You'll sign in, or open an account if you don't have one yet, and accepting places the order at these prices.`,
        ],
        facts: [
          ["Reference", quote.reference],
          ...lines,
          ...(monthly > 0n ? ([["Total a month", fmt(monthly)]] as [string, string][]) : []),
          ...(once > 0n ? ([["Total once", fmt(once)]] as [string, string][]) : []),
          ["Holds until", until],
        ],
        button: { label: "Open the quote", url: `${ctx.appUrl}/quote/${encodeURIComponent(token)}` },
        footnote: `Prices are in ${market.currency}${market.taxEnabled ? `, before ${market.taxLabel}` : ""}. The quote can be accepted until the end of ${until}. Reply to this email with any questions.`,
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
          [isDomain ? "Price" : "Price a month", formatMoney({ amountMinor: isDomain ? order.unitPriceMinor : order.monthlyTotalMinor, currency: order.currency }, order.organisation.locale)],
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
          ["Amount", formatMoney(amount, ctx.locale)],
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
          `You told us you paid ${formatMoney(amount, ctx.locale)} for invoice ${str(p.invoiceNumber)}, but we can't see it in our bank account yet.`,
          `Our team says: ${str(p.note)}`,
          "If you've checked and it went through, reply to this email with proof of payment and we'll look again.",
        ],
        facts: [
          ["Invoice", str(p.invoiceNumber)],
          ["Amount", formatMoney(amount, ctx.locale)],
        ],
        button: { label: "View the invoice", url: `${ctx.appUrl}/app/billing/invoices/${encodeURIComponent(str(p.invoiceId))}` },
      },
    };
  },
  async "spend.usage_invoice"(p, ctx) {
    const amount = fromJson(p.amount as MoneyJson);
    const month = formatMonth(new Date(`${str(p.month)}T00:00:00Z`));
    return {
      subject: `Your Azure usage invoice for ${month}`,
      body: {
        heading: `Azure usage for ${month}`,
        paragraphs: [`Your invoice for what your Azure subscriptions used in ${month} is ready. Cloud spend shows it day by day, by resource group.`],
        facts: [["Amount before VAT", formatMoney(amount, ctx.locale)]],
        button: { label: "View the invoice", url: `${ctx.appUrl}/app/billing/invoices/${encodeURIComponent(str(p.invoiceId))}` },
      },
    };
  },
  async "spend.budget"(p, ctx) {
    const sub = await ctx.db.cloudSubscription.findUnique({ where: { id: str(p.subscriptionId) } });
    if (!sub) return null;
    const used = formatMoney(fromJson(p.used as MoneyJson), ctx.locale);
    const budget = formatMoney(fromJson(p.budget as MoneyJson), ctx.locale);
    const forecast = formatMoney(fromJson(p.forecast as MoneyJson), ctx.locale);
    const level = str(p.level);
    const headline = level === "100" ? `${sub.name} has used its budget for the month` : level === "80" ? `${sub.name} has used 80% of its budget` : `${sub.name} is on course to go over budget`;
    return {
      subject: headline,
      body: {
        heading: headline,
        paragraphs: [
          level === "forecast" ? `At the pace so far this month, Azure usage for ${sub.name} will come to about ${forecast}, over the ${budget} budget you set.` : `Azure usage for ${sub.name} has come to ${used} so far this month, against a budget of ${budget}.`,
          "Nothing is switched off: this is only a warning. Cloud spend shows where the usage is, and we can help you bring it down.",
        ],
        facts: [
          ["Used so far", used],
          ["Forecast for the month", forecast],
          ["Budget", budget],
        ],
        button: { label: "Open Cloud spend", url: `${ctx.appUrl}/app/spend` },
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
