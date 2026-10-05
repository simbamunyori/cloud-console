import { formatLongDate, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import type { Template } from "./templates";

/**
 * Emails to Admins about exchange rates and the monthly price book
 * (src/server/pricing). They hold rates and prices, never customer data.
 */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const pct = (bps: number) => (bps / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 });

type Change = { market: string; name: string; currency: string; from: string; to: string; changeBps: number };

export const PRICING_TEMPLATES: Record<string, Template> = {
  /** An alert written when it was raised: the rates job and the monthly price book send these. */
  async "pricing.alert"(p, ctx) {
    const paragraphs = Array.isArray(p.paragraphs) ? p.paragraphs.filter((x): x is string => typeof x === "string") : [];
    const href = str(p.href).startsWith("/admin/") ? str(p.href) : "/admin/pricing";
    return {
      subject: str(p.subject) || "Pricing needs a look",
      body: { heading: str(p.heading) || "Pricing needs a look", paragraphs, button: { label: "Open Pricing", url: `${ctx.appUrl}${href}` } },
    };
  },

  /** Nothing is approved from the email itself: the link opens a page with one button, after signing in. */
  async "pricing.approval_needed"(p, ctx) {
    const run = await ctx.db.priceBookRun.findUnique({ where: { month: str(p.month) }, include: { table: { select: { publishedOn: true } } } });
    if (!run || run.status !== "AWAITING_APPROVAL") return null;
    const month = formatMonth(new Date(`${run.month}-01T00:00:00Z`));
    const changes = (run.changes as unknown as Change[]).slice().sort((a, b) => b.changeBps - a.changeBps);
    const over = changes.filter((c) => c.changeBps > run.thresholdBps).length;
    const show = (v: string, currency: string) => formatMoney({ amountMinor: BigInt(v), currency }, ctx.locale);
    return {
      subject: `${month} prices need your approval`,
      body: {
        heading: `Approve ${month} prices`,
        paragraphs: [
          `${changes.length} ${changes.length === 1 ? "price changes" : "prices change"} with Bank of Botswana's rates published ${formatLongDate(run.table.publishedOn)}. ${over} ${over === 1 ? "moves" : "move"} by more than ${pct(run.thresholdBps)}%, so they weren't approved automatically. The largest change is ${pct(run.maxChangeBps)}%.`,
          "Last month's prices stay in effect, in the console and in WHMCS, until you approve.",
        ],
        facts: changes.slice(0, 8).map((c) => [`${c.name} (${c.market})`, `${show(c.from, c.currency)} to ${show(c.to, c.currency)}, ${pct(c.changeBps)}%`]),
        button: { label: "Review and approve", url: `${ctx.appUrl}/admin/pricing/months/${run.month}` },
        footnote: changes.length > 8 ? `And ${changes.length - 8} more on the page.` : undefined,
      },
    };
  },
};
