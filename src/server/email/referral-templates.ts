import { formatMonth } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { KIND_LABEL, percentOf, REFERRAL_DAYS, referralSettings } from "@/server/referrals/referrals";
import type { Template, TemplateContext } from "./templates";

/** Referral partners (docs/STRATEGY_ROLLOUT.md, U9). Partners aren't customers: no organisation on these. */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const site = (ctx: TemplateContext) => ctx.siteUrl ?? ctx.appUrl;
const dashboard = (ctx: TemplateContext, p: { market: string; dashboardToken: string | null }) => `${site(ctx)}/${p.market}/referral-partners/${p.dashboardToken}`;
const monthLabel = (m: string) => formatMonth(new Date(`${m}-01T00:00:00Z`));

export const REFERRAL_TEMPLATES: Record<string, Template> = {
  async "referral.received"(p, ctx) {
    const r = await ctx.db.referralPartner.findUnique({ where: { id: str(p.partnerId) } });
    if (!r) return null;
    return {
      subject: "We have your referral partner application",
      body: {
        heading: `Thank you, ${r.name}`,
        paragraphs: [`We have ${r.company}'s application to become a referral partner. Someone from our team will look at it and email you, usually within two working days.`],
      },
    };
  },

  async "referral.applied"(p, ctx) {
    const r = await ctx.db.referralPartner.findUnique({ where: { id: str(p.partnerId) } });
    if (!r) return null;
    return {
      subject: `Referral partner application: ${r.company}`,
      body: {
        heading: "A new referral partner application",
        paragraphs: [`${r.name} of ${r.company} would like to refer customers to us.`],
        facts: [
          ["Firm", r.company],
          ["What they do", KIND_LABEL[r.kind]],
          ["Email", r.email],
          ...(r.phone ? ([["Phone", r.phone]] as [string, string][]) : []),
        ],
        button: { label: "Approve or decline", url: `${ctx.appUrl}/admin/referrals` },
      },
    };
  },

  async "referral.approved"(p, ctx) {
    const r = await ctx.db.referralPartner.findUnique({ where: { id: str(p.partnerId) } });
    if (!r?.code || !r.dashboardToken) return null;
    const rate = r.commissionBps ?? (await referralSettings(ctx.db)).commissionBps;
    return {
      subject: "Welcome to the referral partner programme",
      body: {
        heading: `Welcome, ${r.name}`,
        paragraphs: [
          `${r.company} is now a referral partner of Fourth Generation Technologies. Share your link with clients; anyone who signs up through it within ${REFERRAL_DAYS} days counts as yours.`,
          `You earn ${percentOf(rate)} of what your customers pay us each month. A statement comes early each month, and we pay what's due to the bank account you give on your dashboard.`,
          "Keep your dashboard link private: it shows your customers and statements without a password.",
        ],
        facts: [
          ["Your referral link", `${site(ctx)}/${r.market}?ref=${r.code}`],
          ["Commission", percentOf(rate)],
        ],
        button: { label: "Open your dashboard", url: dashboard(ctx, r) },
      },
    };
  },

  async "referral.declined"(p, ctx) {
    const r = await ctx.db.referralPartner.findUnique({ where: { id: str(p.partnerId) } });
    if (!r) return null;
    return {
      subject: "Your referral partner application",
      body: {
        heading: `Thank you, ${r.name}`,
        paragraphs: ["Thank you for your interest in referring customers to us. We aren't able to take on your firm as a referral partner at the moment. If anything changes, we'll be in touch."],
      },
    };
  },

  async "referral.statement"(p, ctx) {
    const s = await ctx.db.referralStatement.findUnique({ where: { id: str(p.statementId) }, include: { partner: true } });
    if (!s?.partner.dashboardToken) return null;
    const m = (minor: bigint) => formatMoney(money(minor, s.currency), "en-BW");
    return {
      subject: `Your referral statement for ${monthLabel(s.month)}`,
      body: {
        heading: `${monthLabel(s.month)} statement`,
        paragraphs: [
          s.status === "NIL"
            ? `Your customers made no payments to us in ${monthLabel(s.month)}, so nothing is due this time.`
            : `Your customers paid us ${m(s.paidInMinor)} in ${monthLabel(s.month)}. At ${percentOf(s.rateBps)}, your commission is ${m(s.commissionMinor)}. We'll email you when it's paid.`,
        ],
        facts: [
          ["Paid by your customers", m(s.paidInMinor)],
          ["Commission", `${m(s.commissionMinor)} (${percentOf(s.rateBps)})`],
        ],
        button: { label: "See it on your dashboard", url: dashboard(ctx, s.partner) },
        ...(s.status === "DUE" && !s.partner.payoutDetails ? { footnote: "Add your bank details on your dashboard so we can pay you." } : {}),
      },
    };
  },

  async "referral.paid"(p, ctx) {
    const s = await ctx.db.referralStatement.findUnique({ where: { id: str(p.statementId) }, include: { partner: true } });
    if (!s?.partner.dashboardToken || s.status !== "PAID") return null;
    return {
      subject: `Your ${monthLabel(s.month)} commission is paid`,
      body: {
        heading: "Your commission is on its way",
        paragraphs: [`We've paid your ${monthLabel(s.month)} commission of ${formatMoney(money(s.commissionMinor, s.currency), "en-BW")}. It can take a day or two to reach your account.`],
        facts: [["Payment reference", s.paymentRef ?? ""]],
        button: { label: "Open your dashboard", url: dashboard(ctx, s.partner) },
      },
    };
  },
};
