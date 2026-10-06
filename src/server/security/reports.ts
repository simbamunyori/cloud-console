import type { Prisma, PrismaClient, SecurityReport } from "@prisma/client";
import { formatMonth } from "@/lib/dates";
import { companyDetails, logoPng } from "@/server/company/company";
import { renderBusinessPdf, type BusinessDocument } from "@/server/documents/business-pdf";
import { queueEmail } from "@/server/email/outbox";
import { featureOn } from "@/server/features/features";
import { GROUP_LABEL, SCORE_WORD, STATUS_LABEL, type ScoreCheck } from "./score";

/**
 * The monthly security report (docs/STRATEGY_ROLLOUT.md, U4). On the 1st,
 * each organisation's score and checks are kept as last month's report,
 * shown in the console and emailed to its owners and admins as a branded
 * PDF. Each report is written and emailed once.
 */

/** "2026-10" for the month before `now`. */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export const monthLabel = (month: string) => formatMonth(new Date(`${month}-01T00:00:00Z`));

export async function writeMonthlyReports(db: PrismaClient, now = new Date()): Promise<{ written: number; emailed: number }> {
  if (!(await featureOn(db, "security-score"))) return { written: 0, emailed: 0 };
  const month = previousMonth(now);
  const profiles = await db.securityProfile.findMany({ where: { score: { not: null }, organisation: { deletedAt: null } } });
  let written = 0;
  let emailed = 0;
  for (const p of profiles) {
    const recipients = await db.membership.findMany({ where: { organisationId: p.organisationId, active: true, role: { in: ["OWNER", "ADMIN"] } }, select: { user: { select: { email: true } } } });
    await db.$transaction(async (tx) => {
      // The row is the claim: a second run finds it and writes and sends nothing.
      const claimed = await tx.securityReport.createMany({
        data: [{ organisationId: p.organisationId, month, score: p.score!, checks: p.checks as Prisma.InputJsonValue, emailDomain: p.emailDomain ?? (p.emailReport as { domain?: string } | null)?.domain ?? null }],
        skipDuplicates: true,
      });
      if (!claimed.count) return;
      written++;
      const report = await tx.securityReport.findUniqueOrThrow({ where: { organisationId_month: { organisationId: p.organisationId, month } } });
      for (const r of recipients) await queueEmail(tx, { organisationId: p.organisationId, to: r.user.email, kind: "security.report", payload: { reportId: report.id } });
      if (recipients.length) await tx.securityReport.update({ where: { id: report.id }, data: { emailedAt: now } });
      emailed += recipients.length;
    });
  }
  return { written, emailed };
}

export const reportChecks = (r: Pick<SecurityReport, "checks">) => (Array.isArray(r.checks) ? (r.checks as unknown as ScoreCheck[]) : []);

const ORDER: ScoreCheck["status"][] = ["fail", "warn", "pass", "unknown"];

/** The report as a branded document: what needs doing first, then what is good. */
export async function reportDocument(db: Pick<PrismaClient, "companyProfile" | "market">, report: SecurityReport, organisationName: string, appUrl: string): Promise<BusinessDocument> {
  const c = await companyDetails(db);
  const checks = [...reportChecks(report)].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const toFix = checks.filter((x) => x.status === "fail" || x.status === "warn").length;
  return {
    kind: "Security report",
    number: monthLabel(report.month),
    status: `${report.score} out of 100: ${SCORE_WORD(report.score)}`,
    from: { name: c.legalName, lines: [...c.addressLines, ...[c.phone, c.email].filter((x): x is string => Boolean(x))] },
    to: { name: organisationName, lines: report.emailDomain ? [`Email domain checked: ${report.emailDomain}`] : [] },
    facts: [
      ["Month", monthLabel(report.month)],
      ["Score", `${report.score} out of 100`],
      ["To fix", toFix ? String(toFix) : "Nothing"],
    ],
    lines: checks.map((x) => ({ description: `${GROUP_LABEL[x.group]}: ${x.title}`, detail: x.explanation, amount: STATUS_LABEL[x.status] })),
    totals: [["Security score", `${report.score} out of 100`, true]],
    notes: [
      "Each check is worth points; a check that needs attention counts half, and one we can't run yet doesn't count.",
      ...(toFix ? ["Every item to fix has a fix in the console, most in one click."] : []),
    ],
    payment: { heading: "Fix it in the console", rows: [], link: { label: "Open your security score", url: `${appUrl}/app/security/score` } },
    footer: [`${c.legalName} · Registration ${c.registrationNumber} · ${c.addressLines.join(", ")}`, [c.email, c.phone, c.website?.replace(/^https:\/\//, "")].filter(Boolean).join(" · ")],
  };
}

export async function reportPdf(db: Pick<PrismaClient, "companyProfile" | "market">, report: SecurityReport, organisationName: string, appUrl: string) {
  const [doc, logo, c] = await Promise.all([reportDocument(db, report, organisationName, appUrl), logoPng(db, "light"), companyDetails(db)]);
  return renderBusinessPdf(doc, logo, { title: `Security report, ${monthLabel(report.month)}`, author: c.legalName });
}

export const reportFileName = (month: string) => `security-report-${month}.pdf`;

/** Staff: every organisation's latest score, lowest first; those not scored yet last. */
export async function allScores(db: PrismaClient) {
  const profiles = await db.securityProfile.findMany({
    where: { organisation: { deletedAt: null } },
    orderBy: [{ score: { sort: "asc", nulls: "last" } }, { scoredAt: "desc" }],
    include: { organisation: { select: { id: true, name: true, billingMarket: true } } },
  });
  return profiles.map((p) => {
    const checks = Array.isArray(p.checks) ? (p.checks as unknown as ScoreCheck[]) : [];
    return {
      organisation: p.organisation,
      score: p.score,
      scoredAt: p.scoredAt,
      emailDomain: p.emailDomain ?? (p.emailReport as { domain?: string } | null)?.domain ?? null,
      failing: checks.filter((c) => c.status === "fail").map((c) => c.title),
      warnings: checks.filter((c) => c.status === "warn").length,
    };
  });
}
