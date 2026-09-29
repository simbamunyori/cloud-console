/**
 * Turns the legal drafts (a small part of Markdown: # and ## headings,
 * paragraphs, "- " lists, tables, **bold** and email addresses) into the
 * website editor's rich text, for seeding. The "DRAFT FOR LEGAL REVIEW"
 * and "Last updated" lines become the page's own fields.
 */

export interface SeedLegal {
  title: string;
  draftNotice: string | null;
  updated: string | null;
  body: { root: LexicalNode };
}

type LexicalNode = Record<string, unknown> & { type: string; children?: LexicalNode[] };

const DRAFT = /^DRAFT FOR LEGAL REVIEW\b/;
const UPDATED = /^Last updated:/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/g;

const element = (type: string, children: LexicalNode[], extra: Record<string, unknown> = {}): LexicalNode => ({ type, format: "", indent: 0, version: 1, direction: "ltr", children, ...extra });
const textNode = (text: string, bold = false): LexicalNode => ({ type: "text", text, format: bold ? 1 : 0, detail: 0, mode: "normal", style: "", version: 1 });

const linkNode = (children: LexicalNode[], url: string): LexicalNode => element("link", children, { version: 3, fields: { linkType: "custom", url, newTab: false } });

/** A run of text: **bold**, [links](/path) and email addresses (as mailto links). */
export function inline(text: string): LexicalNode[] {
  const out: LexicalNode[] = [];
  for (const [i, part] of text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/).entries()) {
    const md = i % 2 === 1 && part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (md) {
      out.push(linkNode(inline(md[1]), md[2]));
      continue;
    }
    if (!part) continue;
    const bold = i % 2 === 1;
    const words = bold ? part.slice(2, -2) : part;
    let last = 0;
    for (const m of words.matchAll(EMAIL)) {
      if (m.index > last) out.push(textNode(words.slice(last, m.index), bold));
      out.push(linkNode([textNode(m[0], bold)], `mailto:${m[0]}`));
      last = m.index + m[0].length;
    }
    if (last < words.length) out.push(textNode(words.slice(last), bold));
  }
  return out;
}

const paragraph = (text: string) => element("paragraph", inline(text), { textFormat: 0, textStyle: "" });

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function legalFromMarkdown(source: string): SeedLegal {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const doc: SeedLegal = { title: "", draftNotice: null, updated: null, body: { root: element("root", []) } };
  const nodes = doc.body.root.children!;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
    } else if (line.startsWith("# ")) {
      doc.title = line.slice(2).trim();
      i++;
    } else if (line.startsWith("## ")) {
      nodes.push(element("heading", inline(line.slice(3).trim()), { tag: "h2" }));
      i++;
    } else if (line.startsWith("- ")) {
      const items: LexicalNode[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) items.push(element("listitem", inline(lines[i++].trim().slice(2).trim()), { value: items.length + 1 }));
      nodes.push(element("list", items, { listType: "bullet", tag: "ul", start: 1 }));
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = cells(lines[i++]);
        if (!row.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(row);
      }
      nodes.push(
        element(
          "table",
          rows.map((row, r) => element("tablerow", row.map((c) => element("tablecell", [paragraph(c)], { headerState: r === 0 ? 1 : 0, colSpan: 1, rowSpan: 1, backgroundColor: null })))),
        ),
      );
    } else {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|- |\|)/.test(lines[i].trim())) parts.push(lines[i++].trim());
      const text = parts.join(" ");
      if (DRAFT.test(text) && doc.draftNotice === null) doc.draftNotice = text;
      else if (UPDATED.test(text) && doc.updated === null) doc.updated = text;
      else nodes.push(paragraph(text));
    }
  }
  return doc;
}

/** Rich text for a block, from the same small Markdown. */
export const richFromMarkdown = (source: string): SeedLegal["body"] => legalFromMarkdown(source).body;
