import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL } from "@/server/soc/labels";
import type { Template } from "./templates";

/** Managed security emails (docs/STRATEGY_ROLLOUT.md, U5). Customers' emails are under our name only; the provider is never named. */

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const SOC_TEMPLATES: Record<string, Template> = {
  async "soc.incident"(p, ctx) {
    const i = await ctx.db.securityIncident.findUnique({ where: { id: str(p.incidentId) }, include: { organisation: { select: { name: true } } } });
    if (!i) return null;
    const resolved = i.status === "RESOLVED";
    return {
      subject: resolved ? `Resolved: ${i.title} (${i.reference})` : `${SEVERITY_LABEL[i.severity]} security incident: ${i.title} (${i.reference})`,
      body: {
        heading: resolved ? "A security incident is resolved" : "We're dealing with a security incident",
        paragraphs: [
          resolved ? `The incident below at ${i.organisation.name} is resolved.` : `Our security operations centre found something at ${i.organisation.name} and is on it. ${i.summary}`,
          ...(i.ourAction ? [`What we are doing: ${i.ourAction}`] : []),
        ],
        facts: [
          ["Reference", i.reference],
          ["Severity", SEVERITY_LABEL[i.severity]],
          ["Status", INCIDENT_STATUS_LABEL[i.status]],
          ...(i.deviceName ? ([["Device", i.deviceName]] as [string, string][]) : []),
          ["Opened", formatMoment(i.createdAt, ctx.timeZone)],
        ],
        button: { label: "Follow it in the console", url: `${ctx.appUrl}/app/security/managed/incidents/${encodeURIComponent(i.reference)}` },
      },
    };
  },

  async "soc.escalation"(p, ctx) {
    const i = await ctx.db.securityIncident.findUnique({ where: { id: str(p.incidentId) }, include: { organisation: { select: { name: true } }, assignee: { select: { name: true } } } });
    if (!i) return null;
    return {
      subject: `Escalated (level ${i.escalationLevel}): ${SEVERITY_LABEL[i.severity]} incident at ${i.organisation.name} (${i.reference})`,
      body: {
        heading: "A security incident needs someone now",
        paragraphs: [str(p.why) || "This incident was escalated."],
        facts: [
          ["Customer", i.organisation.name],
          ["Incident", `${i.reference}: ${i.title}`],
          ["Severity", SEVERITY_LABEL[i.severity]],
          ["Response was due", formatMoment(i.respondBy, DEFAULT_TIME_ZONE)],
          ["Assigned to", i.assignee?.name ?? "Nobody"],
        ],
        button: { label: "Open the incident", url: `${ctx.appUrl}/admin/soc/${encodeURIComponent(i.reference)}` },
      },
    };
  },
};
