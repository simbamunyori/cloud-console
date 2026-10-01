import type { LeadSource } from "@prisma/client";
import { company } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { calendarInvite } from "@/lib/ics";
import { hashToken, newToken } from "@/server/auth/tokens";
import { unsubscribeLeadUrl } from "@/server/leads/capture";
import { sequenceEmail } from "@/server/leads/sequences";
import { bookingOpen, TOPICS } from "@/server/presales/booking";
import type { Template, TemplateContext } from "./templates";

/**
 * The sales funnel's emails (final build, Milestone 8): lead follow-ups
 * with a one-click unsubscribe, and booked calls with calendar invites.
 */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

async function bookingFor(ctx: TemplateContext, id: string) {
  const booking = await ctx.db.presalesBooking.findUnique({ where: { id }, include: { engineer: { include: { user: { select: { name: true, email: true } } } } } });
  if (!booking) return null;
  const market = await ctx.db.market.findUnique({ where: { code: booking.market }, select: { timeZone: true, supportEmail: true } });
  return { booking, timeZone: market?.timeZone ?? ctx.timeZone, organizer: { name: company.name, email: market?.supportEmail ?? booking.engineer.user.email } };
}

type Found = NonNullable<Awaited<ReturnType<typeof bookingFor>>>;

function invite(f: Found, method: "REQUEST" | "CANCEL", appUrl: string, now: Date) {
  const { booking: b } = f;
  return {
    method,
    content: calendarInvite({
      method,
      uid: `${b.reference.toLowerCase()}@${new URL(appUrl).hostname}`,
      sequence: b.sequence,
      start: b.startsAt,
      end: b.endsAt,
      summary: `${company.name}: ${TOPICS[b.topic] ?? "Call"}`,
      description: [
        `A ${Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000)} minute call with ${b.engineer.user.name}.`,
        b.engineer.meetingUrl ? `Join: ${b.engineer.meetingUrl}` : `We'll call ${b.phone ?? "you"}.`,
        b.notes ? `Notes: ${b.notes}` : "",
        `Reference: ${b.reference}`,
      ]
        .filter(Boolean)
        .join("\n"),
      location: b.engineer.meetingUrl ?? (b.phone ? `Phone: ${b.phone}` : null),
      organizer: f.organizer,
      attendees: [
        { name: b.engineer.user.name, email: b.engineer.user.email },
        { name: b.name, email: b.email },
      ],
      now,
    }),
  };
}

/** A fresh cancel link for the visitor; only the newest email's link works. */
async function cancelLink(ctx: TemplateContext, f: Found) {
  const token = newToken();
  await ctx.db.presalesBooking.update({ where: { id: f.booking.id }, data: { cancelTokenHash: hashToken(token) } });
  return `${ctx.appUrl}/${f.booking.market}/book/cancel/${encodeURIComponent(token)}`;
}

export const FUNNEL_TEMPLATES: Record<string, Template> = {
  async "lead.follow-up"(p, ctx) {
    const lead = await ctx.db.lead.findUnique({ where: { id: str(p.leadId) } });
    // Stopped since it was queued: they ordered or unsubscribed.
    if (!lead || (lead.followUpStoppedAt && lead.followUpStopped !== "finished")) return null;
    const unsubscribe = unsubscribeLeadUrl(ctx.appUrl, lead);
    const email = sequenceEmail(str(p.sequence) as LeadSource, num(p.step), {
      appUrl: ctx.appUrl,
      market: lead.market,
      name: lead.name,
      need: lead.need,
      result: lead.toolResult,
      bookingUrl: (await bookingOpen(ctx.db)) ? `${ctx.appUrl}/${lead.market}/book` : null,
    });
    if (!email || !unsubscribe) return null;
    const oneClick = `${ctx.appUrl}/api/leads/unsubscribe/${encodeURIComponent(lead.unsubscribeToken!)}`;
    return {
      subject: email.subject,
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      body: {
        ...email.body,
        footnote: [email.body.footnote, `You get this because you used a free tool or asked us something on our website. Stop these emails at any time: ${unsubscribe}`].filter(Boolean).join(" "),
      },
    };
  },

  async "booking.invite"(p, ctx) {
    const f = await bookingFor(ctx, str(p.bookingId));
    if (!f || f.booking.status !== "BOOKED") return null;
    const b = f.booking;
    const when = formatMoment(b.startsAt, f.timeZone);
    const join = b.engineer.meetingUrl ? `Join from the link in the invite: ${b.engineer.meetingUrl}` : `${b.engineer.user.name} will call you${b.phone ? ` on ${b.phone}` : ""}.`;
    if (str(p.to) === "engineer") {
      return {
        subject: `Pre-sales call booked: ${b.name}${b.company ? `, ${b.company}` : ""}, ${when}`,
        calendar: invite(f, "REQUEST", ctx.appUrl, ctx.now),
        body: {
          heading: "A visitor booked a call with you",
          paragraphs: [
            `${b.name}${b.company ? ` of ${b.company}` : ""} booked 30 minutes about ${TOPICS[b.topic]?.toLowerCase() ?? "our services"}. The invite is attached.`,
            ...(b.notes ? [`Their notes: ${b.notes}`] : []),
          ],
          facts: [
            ["When", when],
            ["Email", b.email],
            ["Phone", b.phone ?? "Not given"],
            ["Reference", b.reference],
          ],
          button: { label: "Open bookings", url: `${ctx.appUrl}/admin/bookings` },
        },
      };
    }
    return {
      subject: `Your call with ${company.name}, ${when}`,
      calendar: invite(f, "REQUEST", ctx.appUrl, ctx.now),
      body: {
        heading: "Your call is booked",
        paragraphs: [`${b.engineer.user.name} will talk to you about ${TOPICS[b.topic]?.toLowerCase() ?? "our services"} for 30 minutes. Accept the invite to add it to your calendar.`, join],
        facts: [
          ["When", `${when} (${f.timeZone.replace(/_/g, " ")} time)`],
          ["Reference", b.reference],
        ],
        button: { label: "Cancel or change the time", url: await cancelLink(ctx, f) },
        footnote: "To change the time, cancel and book again. The link works until the call starts.",
      },
    };
  },

  async "booking.reminder"(p, ctx) {
    const f = await bookingFor(ctx, str(p.bookingId));
    if (!f || f.booking.status !== "BOOKED" || f.booking.startsAt <= ctx.now) return null;
    const b = f.booking;
    const when = formatMoment(b.startsAt, f.timeZone);
    return {
      subject: `Tomorrow: your call with ${company.name}`,
      body: {
        heading: "A reminder of your call",
        paragraphs: [
          `${b.engineer.user.name} is looking forward to talking to you, ${when}.`,
          b.engineer.meetingUrl ? `Join here: ${b.engineer.meetingUrl}` : `${b.engineer.user.name} will call you${b.phone ? ` on ${b.phone}` : ""}.`,
        ],
        facts: [["Reference", b.reference]],
        button: { label: "Cancel the call", url: await cancelLink(ctx, f) },
        footnote: "This link replaces the one in your booking email.",
      },
    };
  },

  async "booking.cancelled"(p, ctx) {
    const f = await bookingFor(ctx, str(p.bookingId));
    if (!f || f.booking.status !== "CANCELLED") return null;
    const b = f.booking;
    const when = formatMoment(b.startsAt, f.timeZone);
    const engineer = str(p.to) === "engineer";
    return {
      subject: engineer ? `Cancelled: call with ${b.name}, ${when}` : `Cancelled: your call with ${company.name}`,
      calendar: invite(f, "CANCEL", ctx.appUrl, ctx.now),
      body: {
        heading: "The call is cancelled",
        paragraphs: engineer
          ? [`The call with ${b.name}${b.company ? ` of ${b.company}` : ""} on ${when} is cancelled${b.cancelledBy === "visitor" ? " by the visitor" : ""}. It comes off your calendar.`]
          : [`Your call on ${when} is cancelled.`, "Book another time whenever suits you."],
        facts: [["Reference", b.reference]],
        ...(engineer ? {} : { button: { label: "Book another time", url: `${ctx.appUrl}/${b.market}/book?topic=${b.topic}` } }),
      },
    };
  },
};
