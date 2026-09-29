import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

/**
 * Legal pages written for a market, in content/legal/<market>/<slug>.md.
 * The files use a small part of Markdown: # and ## headings, paragraphs,
 * "- " lists, tables and **bold**. That is all this reads; anything else
 * shows as plain text, never as HTML.
 */

export const LEGAL_SLUGS = ["terms", "privacy", "refunds", "service-providers", "data-protection"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

/** The refunds policy section a customer is pointed to when agreeing that a service starts now. */
export const REFUNDS_CONSENT_SECTION = "seven-day-cooling-off-for-consumers";

export type LegalBlock =
  | { type: "heading"; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export interface LegalDocument {
  title: string;
  /** The "DRAFT FOR LEGAL REVIEW" line, until it is taken out of the file. */
  draft: string | null;
  updated: string | null;
  blocks: LegalBlock[];
}

const DRAFT = /^DRAFT FOR LEGAL REVIEW\b/;
const UPDATED = /^Last updated:/;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseLegal(source: string): LegalDocument {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const doc: LegalDocument = { title: "", draft: null, updated: null, blocks: [] };
  const ids = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
    } else if (line.startsWith("# ")) {
      doc.title = line.slice(2).trim();
      i++;
    } else if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      let id = slugify(text) || "section";
      while (ids.has(id)) id += "-2";
      ids.add(id);
      doc.blocks.push({ type: "heading", text, id });
      i++;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) items.push(lines[i++].trim().slice(2).trim());
      doc.blocks.push({ type: "list", items });
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = cells(lines[i++]);
        if (!row.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(row);
      }
      doc.blocks.push({ type: "table", head: rows[0] ?? [], rows: rows.slice(1) });
    } else {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|- |\|)/.test(lines[i].trim())) parts.push(lines[i++].trim());
      const text = parts.join(" ");
      if (DRAFT.test(text) && doc.draft === null) doc.draft = text;
      else if (UPDATED.test(text) && doc.updated === null) doc.updated = text;
      else doc.blocks.push({ type: "paragraph", text });
    }
  }
  return doc;
}

const ROOT = path.join(process.cwd(), "content", "legal");

/** The market's own text for a legal page, or null when it hasn't been written yet. */
export const legalDocument = cache(async (market: string, slug: LegalSlug): Promise<LegalDocument | null> => {
  if (!/^[a-z]{2,8}$/.test(market)) return null;
  try {
    return parseLegal(await readFile(path.join(ROOT, market, `${slug}.md`), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
});
