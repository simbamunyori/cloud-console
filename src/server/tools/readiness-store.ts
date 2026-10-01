import type { PrismaClient, ReadinessCheck } from "@prisma/client";
import tokens from "@/config/theme/tokens.json";
import { company } from "@/config/app";
import { formatLongDate } from "@/lib/dates";
import { pdfColour, renderPdf, type PdfLine } from "@/lib/pdf";
import { newToken } from "@/server/auth/tokens";
import { keepUntil } from "@/server/leads/capture";
import { answersOf, band, nextSteps, QUESTIONS, READINESS_KEEP_DAYS, readinessScore, type Answer } from "./readiness";

/** Saves a filled-in checklist. Its random token is the visitor's link to the result. */
export async function saveReadiness(db: Pick<PrismaClient, "readinessCheck">, market: string, answers: Record<string, Answer>, now = new Date()) {
  return db.readinessCheck.create({
    data: { token: newToken(), market, answers, score: readinessScore(answers), purgeAfter: new Date(now.getTime() + READINESS_KEEP_DAYS * 86_400_000) },
  });
}

export function readinessByToken(db: Pick<PrismaClient, "readinessCheck">, token: string) {
  return db.readinessCheck.findUnique({ where: { token } });
}

/**
 * The downloadable summary comes with an account: the first organisation
 * to open the link keeps it, and nobody else can see it after that.
 */
export async function claimReadiness(db: Pick<PrismaClient, "readinessCheck">, token: string, organisationId: string, now = new Date()): Promise<ReadinessCheck | null> {
  const row = await readinessByToken(db, token);
  if (!row) return null;
  if (row.organisationId && row.organisationId !== organisationId) return null;
  if (!row.organisationId) return db.readinessCheck.update({ where: { id: row.id }, data: { organisationId, purgeAfter: keepUntil(now) } });
  return row;
}

const ANSWER_WORD: Record<Answer, string> = { yes: "Yes", partly: "Partly", no: "No" };

/** The summary as a PDF: the score, each answer, and the next steps in order. */
export function readinessPdf(row: Pick<ReadinessCheck, "answers" | "score" | "createdAt">, o: { law: string; organisation: string }): Buffer {
  const answers = answersOf(row.answers);
  const steps = nextSteps(answers);
  const b = band(row.score);
  const navy = pdfColour(tokens.brand.navy);
  const muted = pdfColour(tokens.light.textMuted);
  const lines: PdfLine[] = [
    { text: company.name, size: 9, color: muted },
    { text: "Data protection readiness summary", size: 20, bold: true, color: navy, space: 6 },
    { text: `${o.organisation}. Answered on ${formatLongDate(row.createdAt)}, measured against the ${o.law}.`, color: muted, space: 2 },
    { text: `Score: ${row.score} out of 100. ${b.label}.`, size: 14, bold: true, color: navy, space: 18 },
    { text: b.text, space: 2 },
    { text: "Next steps, most important first", size: 13, bold: true, color: navy, space: 18 },
    ...(steps.length
      ? steps.flatMap((s, i) => [{ text: `${i + 1}. ${s.step}`, space: 6 }])
      : [{ text: "You answered yes to every question. Review your answers once a year, and whenever you take on a new system or supplier.", space: 6 }]),
    { text: "Your answers", size: 13, bold: true, color: navy, space: 18 },
    ...QUESTIONS.flatMap((q) => [
      { text: q.text, space: 6 },
      { text: ANSWER_WORD[answers[q.key] ?? "no"], bold: true, indent: 14 },
    ]),
    { text: "This summary is a guide to help you plan, not legal advice. For advice on your own situation, speak to a lawyer.", size: 9, color: muted, space: 22 },
  ];
  return renderPdf(lines, { title: "Data protection readiness summary", footer: `${company.legalName}` });
}
