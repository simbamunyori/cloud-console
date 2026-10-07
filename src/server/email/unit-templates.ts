import { formatDay } from "@/lib/dates";
import type { Template } from "./templates";

/** Service standards and the partner register (docs/STRATEGY_ROLLOUT.md, U7). */

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const UNIT_TEMPLATES: Record<string, Template> = {
  async "ticket.rating"(p, ctx) {
    const ticket = await ctx.db.ticket.findUnique({ where: { id: str(p.ticketId) }, include: { organisation: { select: { billingMarket: true } } } });
    if (!ticket || ticket.deletedAt || !ticket.ratingToken || ticket.rating !== null) return null;
    const base = `${ctx.siteUrl ?? ctx.appUrl}/${ticket.organisation.billingMarket}/rate/${encodeURIComponent(ticket.ratingToken)}`;
    const scores: [number, string][] = [
      [5, "Very good"],
      [4, "Good"],
      [3, "OK"],
      [2, "Poor"],
      [1, "Very poor"],
    ];
    return {
      subject: `How did we do on ${ticket.reference}?`,
      body: {
        heading: "How did we do?",
        paragraphs: [`Your question "${ticket.subject}" is sorted. One question: how happy are you with our help? Choose an answer below; it takes a second.`],
        items: scores.map(([n, label]) => ({ title: `${n}: ${label}`, summary: "", url: `${base}?score=${n}` })),
        facts: [["Ticket", ticket.reference]],
        footnote: "If it isn't sorted after all, reply in the console and we'll pick it up again.",
      },
    };
  },

  async "partner.renewal"(p, ctx) {
    const r = await ctx.db.partnerRecord.findUnique({ where: { id: str(p.partnerId) } });
    if (!r?.renewsOn) return null;
    const noticeBy = new Date(r.renewsOn.getTime() - r.noticeDays * 86_400_000);
    return {
      subject: `${r.name}'s agreement renews on ${formatDay(r.renewsOn, true)}`,
      body: {
        heading: "A partner agreement is coming up for renewal",
        paragraphs: [
          `The agreement with ${r.name} renews on ${formatDay(r.renewsOn, true)}. It needs ${r.noticeDays} days' notice, so decide by ${formatDay(noticeBy, true)} whether to renew, renegotiate or end it.`,
          ...(r.products.length ? [`Products that depend on it: ${r.products.join(", ")}.`] : []),
        ],
        facts: [
          ["Partner", r.name],
          ["Category", r.category],
          ...(r.agreementRef ? ([["Agreement", r.agreementRef]] as [string, string][]) : []),
        ],
        button: { label: "Open the partner register", url: `${ctx.appUrl}/admin/partner-register` },
      },
    };
  },
};
