/**
 * A small, text-only PDF writer for one-page-style summaries: headings and
 * wrapped paragraphs in the standard Helvetica fonts on A4, over as many
 * pages as the text needs. Nothing is embedded, so files stay tiny.
 */

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  /** Extra space above, in points. */
  space?: number;
  /** Indent from the left margin, in points. */
  indent?: number;
  /** Text colour as [r, g, b], each 0 to 1. */
  color?: [number, number, number];
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;

/** Characters WinAnsi can't show become their nearest plain equivalent. */
function winAnsi(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function wrap(text: string, size: number, width: number, bold: boolean): string[] {
  // Helvetica averages about half an em per character; bold a little wider.
  const max = Math.max(10, Math.floor(width / (size * (bold ? 0.56 : 0.51))));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line ? `${line} ${word}` : word).length > max && line) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

export function renderPdf(lines: PdfLine[], o: { title: string; footer?: string }): Buffer {
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const l of lines) {
    const size = l.size ?? 10.5;
    const lead = size * 1.4;
    const indent = l.indent ?? 0;
    y -= l.space ?? 0;
    for (const row of wrap(winAnsi(l.text), size, PAGE_W - 2 * MARGIN - indent, Boolean(l.bold))) {
      if (y - lead < MARGIN + 24) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= lead;
      const [r, g, b] = l.color ?? [0.1, 0.12, 0.16];
      pages.at(-1)!.push(`BT /${l.bold ? "F2" : "F1"} ${size} Tf ${r} ${g} ${b} rg ${(MARGIN + indent).toFixed(2)} ${y.toFixed(2)} Td (${escape(row)}) Tj ET`);
    }
  }

  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1;
  const catalog = add("");
  const pagesId = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const info = add(`<< /Title (${escape(winAnsi(o.title))}) /Producer (Cloud Console) >>`);
  const kids: number[] = [];
  pages.forEach((ops, i) => {
    const footer = `BT /F1 8 Tf 0.4 0.42 0.46 rg ${MARGIN} ${MARGIN - 8} Td (${escape(winAnsi(`${o.footer ? `${o.footer}   ` : ""}Page ${i + 1} of ${pages.length}`))}) Tj ET`;
    const stream = [...ops, footer].join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A "#1B2A4A" style colour as PDF numbers. */
export function pdfColour(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Math.round(v * 1000) / 1000) as [number, number, number];
}
