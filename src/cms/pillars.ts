/**
 * The pillar order (docs/STRATEGY_ROLLOUT.md, section 1): cloud and
 * productivity; security; resilience and compliance; digital growth;
 * business apps (Thebe). The What we look after section, the footer column
 * of the same name and the header's menus follow it. Connectivity stays
 * hidden until the BOCRA licence is granted, so it has no place here yet.
 */
const PILLARS: RegExp[] = [/^(email|microsoft 365|cloud and productivity)/i, /^security/i, /^(hosting and backup|cloud hosting|backup|resilience)/i, /^domains?$/i, /^websites?/i, /^(expense management|thebe|business apps)/i];

/** Where a title sits in the pillar order, or null for anything else (Support, Plans, an editor's own). */
export function pillarRank(title: string | null | undefined): number | null {
  if (!title) return null;
  const i = PILLARS.findIndex((p) => p.test(title.trim()));
  return i < 0 ? null : i;
}

/**
 * The same rows in pillar order. Rows that aren't a pillar keep their
 * place, so an editor's own entries and the right-hand Support menu stay
 * where they are; only the pillars swap among their own slots.
 */
export function inPillarOrder<T>(rows: T[], title: (row: T) => string | null | undefined): T[] {
  const slots = rows.flatMap((row, i) => (pillarRank(title(row)) === null ? [] : [i]));
  const pillars = slots.map((i) => rows[i]).sort((a, b) => pillarRank(title(a))! - pillarRank(title(b))!);
  const out = [...rows];
  slots.forEach((slot, n) => (out[slot] = pillars[n]));
  return out;
}

/** True when the rows are already in pillar order. */
export const isPillarOrdered = <T>(rows: T[], title: (row: T) => string | null | undefined) => inPillarOrder(rows, title).every((row, i) => row === rows[i]);
