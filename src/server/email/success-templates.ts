import { formatMonth } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { SOURCE_LABEL } from "@/server/leads/sequences";
import { FIGURES, figureStatus, figureValue, formatFigure, formatTarget, PILLAR_KEYS, PILLARS, successSettings, type SuccessData } from "@/server/success/success";
import type { Template } from "./templates";

/** The directors' monthly email (docs/STRATEGY_ROLLOUT.md, U8). */

const STATUS = { "on-track": "on track", behind: "behind", "no-target": "no target set", "no-data": "not enough data" } as const;

export const SUCCESS_TEMPLATES: Record<string, Template> = {
  async "success.monthly"(p, ctx) {
    const month = typeof p.month === "string" ? p.month : "";
    const snap = await ctx.db.successSnapshot.findUnique({ where: { month } });
    if (!snap) return null;
    const d = snap.data as unknown as SuccessData;
    const { targets } = await successSettings(ctx.db);
    const label = formatMonth(new Date(`${month}-01T00:00:00Z`));
    const rows = FIGURES.map((f) => {
      const t = targets[f.key];
      const status = figureStatus(figureValue(d, f.key), t);
      return { f, status, line: `${formatFigure(d, f.key)}${t === undefined ? "" : status === "no-data" ? ` (target ${formatTarget(f.key, t, d.currency)})` : ` (target ${formatTarget(f.key, t, d.currency)}, ${STATUS[status]})`}` };
    });
    const behind = rows.filter((r) => r.status === "behind");
    const m = (minor: string) => formatMoney(money(BigInt(minor), d.currency), "en-BW");
    return {
      subject: `${label}: ${behind.length ? `${behind.length} ${behind.length === 1 ? "figure" : "figures"} behind target` : "the month's figures"}`,
      body: {
        heading: `How ${label} went`,
        paragraphs: [
          `${d.managedCustomers} managed ${d.managedCustomers === 1 ? "customer" : "customers"}${d.netNew === null ? "" : ` (${d.gained} new, ${d.lost} left)`}, and ${d.hostingOnlyCustomers} on hosting only. Recurring revenue was ${m(d.mrrTotal)} a month: ${m(d.managedMrr)} from managed customers and ${m(d.hostingOnlyMrr)} from hosting-only customers.`,
          behind.length ? `Behind target: ${behind.map((r) => r.f.label.toLowerCase()).join("; ")}.` : "Nothing is behind target.",
          ...(d.unreadable || d.unconverted ? [`Not counted: ${d.unreadable} ${d.unreadable === 1 ? "customer" : "customers"} whose services couldn't be read, and ${d.unconverted} ${d.unconverted === 1 ? "amount" : "amounts"} with no exchange rate.`] : []),
        ],
        facts: [
          ...rows.map((r) => [r.f.label, r.line] as [string, string]),
          ...PILLAR_KEYS.filter((k) => d.mrrByPillar[k] !== "0").map((k) => [`Revenue: ${PILLARS[k]}`, `${m(d.mrrByPillar[k])} a month`] as [string, string]),
          ...d.leadsBySource.map((s) => [`Leads: ${SOURCE_LABEL[s.source]}`, `${s.leads}, ${s.converted} became customers`] as [string, string]),
        ],
        button: { label: "Open the success dashboard", url: `${ctx.appUrl}/admin/success` },
      },
    };
  },
};
