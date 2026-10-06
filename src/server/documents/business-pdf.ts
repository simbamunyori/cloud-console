import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb as pdfColour, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import tokens from "@/config/theme/tokens.json";
import { brandAsset } from "@/server/company/company";

/**
 * Branded invoices and quotes as PDF (docs/STRATEGY_ROLLOUT.md, U1): the
 * logo, company details, the lines, totals, bank details with the
 * reference, terms, and links to pay or accept online. A4, in Poppins, the
 * brand typeface. The same layout serves both; only the words differ.
 */

export interface BusinessDocument {
  /** "Invoice" or "Quote". */
  kind: string;
  number: string;
  /** e.g. "Paid", "Unpaid", "Holds until 20 October 2026". */
  status?: string;
  from: { name: string; lines: string[] };
  to: { name: string; lines: string[] };
  /** Label and value: issued, due, purchase order. */
  facts: [string, string][];
  lines: { description: string; detail?: string; amount: string }[];
  /** Label, value, and whether it is the line to pay. */
  totals: [string, string, boolean?][];
  /** Shown above the bank details, e.g. a quote's message. */
  notes?: string[];
  payment?: {
    heading: string;
    rows: [string, string][];
    /** A button-like link, e.g. "Pay online" or "Accept online". */
    link?: { label: string; url: string };
  };
  terms?: string[];
  /** Small print on every page. */
  footer: string[];
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
/** A token's colour for pdf-lib. Every colour here comes from tokens.json. */
const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return pdfColour(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const NAVY = hex(tokens.brand.navy);
const INK = hex(tokens.light.text);
const MUTED = hex(tokens.light.textMuted);
const RULE = hex(tokens.light.border);
const MIST = hex(tokens.brand.mist);
const LINK = hex(tokens.light.primaryText);
const ON_LINK = hex(tokens.light.onPrimary);

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  constructor(
    readonly pdf: PDFDocument,
    readonly bold: PDFFont,
    readonly light: PDFFont,
    readonly footer: string[],
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - MARGIN;
  }

  /** Room for h points above the footer, or a new page. */
  need(h: number) {
    if (this.y - h < MARGIN + 72) this.newPage();
  }

  width(text: string, size: number, font = this.light) {
    return font.widthOfTextAtSize(text, size);
  }

  /** Splits text into lines that fit. */
  wrap(text: string, size: number, maxWidth: number, font = this.light): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.width(next, size, font) <= maxWidth || !line) line = next;
        else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }

  text(text: string, x: number, size: number, opts: { font?: PDFFont; color?: RGB; y?: number } = {}) {
    this.page.drawText(text, { x, y: opts.y ?? this.y, size, font: opts.font ?? this.light, color: opts.color ?? INK });
  }

  /** Writes wrapped text down the page from x; returns the height used. */
  block(text: string, x: number, size: number, maxWidth: number, opts: { font?: PDFFont; color?: RGB; leading?: number } = {}) {
    const leading = opts.leading ?? size * 1.45;
    const lines = this.wrap(text, size, maxWidth, opts.font);
    for (const line of lines) {
      this.need(leading);
      this.text(line, x, size, opts);
      this.y -= leading;
    }
    return lines.length * leading;
  }

  rule(y = this.y, color = RULE) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.75, color });
  }

  link(label: string, url: string, x: number, size: number) {
    const w = this.width(label, size, this.bold) + 24;
    const h = size + 14;
    const top = this.y;
    this.page.drawRectangle({ x, y: top - h + 4, width: w, height: h, color: hex(tokens.brand.electricBlue) });
    this.text(label, x + 12, size, { font: this.bold, color: ON_LINK, y: top - h + 4 + 7 });
    const annotation = this.pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, top - h + 4, x + w, top + 4],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    const ref = this.pdf.context.register(annotation);
    const annots = this.page.node.lookup(PDFName.of("Annots"));
    if (annots && "push" in annots) (annots as unknown as { push: (r: unknown) => void }).push(ref);
    else this.page.node.set(PDFName.of("Annots"), this.pdf.context.obj([ref]));
    this.y -= h + 4;
    // The address too, for printed copies.
    this.block(url, x, 8, A4.width - MARGIN - x, { color: LINK });
  }

  finish() {
    const total = this.pages.length;
    const lines = this.footer.flatMap((l) => this.wrap(l, 7.5, A4.width - MARGIN * 2 - 70));
    this.pages.forEach((page, i) => {
      let y = MARGIN - 4 + (lines.length - 1) * 11;
      page.drawLine({ start: { x: MARGIN, y: y + 16 }, end: { x: A4.width - MARGIN, y: y + 16 }, thickness: 0.75, color: RULE });
      for (const line of lines) {
        page.drawText(line, { x: MARGIN, y, size: 7.5, font: this.light, color: MUTED });
        y -= 11;
      }
      if (total > 1) {
        const label = `Page ${i + 1} of ${total}`;
        page.drawText(label, { x: A4.width - MARGIN - this.light.widthOfTextAtSize(label, 7.5), y: MARGIN - 4, size: 7.5, font: this.light, color: MUTED });
      }
    });
  }
}

/** PDF-safe text: Poppins covers Latin text; anything else becomes a plain stand-in. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E -ſ–•€£]/g, "?");

export async function renderBusinessPdf(doc: BusinessDocument, logo: Buffer, meta: { title: string; author: string }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [boldBytes, lightBytes] = await Promise.all([brandAsset("fonts", "Poppins-Bold.ttf"), brandAsset("fonts", "Poppins-Light.ttf")]);
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const light = await pdf.embedFont(lightBytes, { subset: true });
  pdf.setTitle(safe(meta.title));
  pdf.setAuthor(safe(meta.author));
  pdf.setCreator(safe(meta.author));
  pdf.setProducer(safe(meta.author));
  const w = new Writer(pdf, bold, light, doc.footer.map(safe));
  const right = A4.width - MARGIN;
  const contentWidth = A4.width - MARGIN * 2;

  // Header: logo left, the document's name and number right.
  const image = await pdf.embedPng(logo);
  const logoWidth = 168;
  const logoHeight = (image.height / image.width) * logoWidth;
  w.page.drawImage(image, { x: MARGIN, y: w.y - logoHeight + 6, width: logoWidth, height: logoHeight });
  const title = safe(doc.kind.toUpperCase());
  w.text(title, right - w.width(title, 20, bold), 20, { font: bold, color: NAVY, y: w.y - 14 });
  const number = safe(doc.number);
  w.text(number, right - w.width(number, 11, bold), 11, { font: bold, y: w.y - 32 });
  if (doc.status) {
    const status = safe(doc.status);
    w.text(status, right - w.width(status, 9), 9, { color: MUTED, y: w.y - 47 });
  }
  w.y -= Math.max(logoHeight, 56) + 22;

  // From and to.
  const col = contentWidth / 2;
  const top = w.y;
  const party = (label: string, p: { name: string; lines: string[] }, x: number) => {
    w.y = top;
    w.text(label.toUpperCase(), x, 7.5, { font: bold, color: MUTED });
    w.y -= 14;
    w.block(safe(p.name), x, 10, col - 16, { font: bold, color: NAVY });
    for (const l of p.lines) w.block(safe(l), x, 8.5, col - 16, { color: MUTED, leading: 12 });
    return w.y;
  };
  const leftEnd = party("From", doc.from, MARGIN);
  const rightEnd = party(doc.kind === "Quote" ? "Prepared for" : "Bill to", doc.to, MARGIN + col);
  w.y = Math.min(leftEnd, rightEnd) - 12;

  // Dates and references in a band.
  if (doc.facts.length) {
    const h = 34;
    w.need(h + 8);
    w.page.drawRectangle({ x: MARGIN, y: w.y - h + 10, width: contentWidth, height: h, color: MIST });
    const step = contentWidth / doc.facts.length;
    doc.facts.forEach(([k, v], i) => {
      const x = MARGIN + 12 + step * i;
      w.text(safe(k).toUpperCase(), x, 7, { font: bold, color: MUTED, y: w.y - 2 });
      w.text(safe(v), x, 9.5, { font: bold, y: w.y - 15 });
    });
    w.y -= h + 14;
  }

  // Lines.
  w.need(40);
  w.text("DESCRIPTION", MARGIN, 7.5, { font: bold, color: MUTED });
  w.text("AMOUNT", right - w.width("AMOUNT", 7.5, bold), 7.5, { font: bold, color: MUTED });
  w.y -= 8;
  w.rule(w.y, NAVY);
  w.y -= 16;
  const amountWidth = 110;
  for (const line of doc.lines) {
    const descLines = w.wrap(safe(line.description), 9.5, contentWidth - amountWidth, light);
    const detailLines = line.detail ? w.wrap(safe(line.detail), 8, contentWidth - amountWidth) : [];
    w.need(descLines.length * 14 + detailLines.length * 11 + 10);
    const amount = safe(line.amount);
    w.text(amount, right - w.width(amount, 9.5, bold), 9.5, { font: bold });
    for (const l of descLines) {
      w.text(l, MARGIN, 9.5);
      w.y -= 14;
    }
    for (const l of detailLines) {
      w.text(l, MARGIN, 8, { color: MUTED });
      w.y -= 11;
    }
    w.y -= 2;
    w.rule(w.y + 6);
    w.y -= 10;
  }

  // Totals, right aligned.
  w.y -= 2;
  for (const [label, value, strong] of doc.totals) {
    const size = strong ? 12 : 9.5;
    w.need(size + 10);
    const font = strong ? bold : light;
    const l = safe(label);
    const v = safe(value);
    w.text(l, right - amountWidth - 140 + (140 - w.width(l, strong ? 10 : 9, font)), strong ? 10 : 9, { font, color: strong ? NAVY : MUTED });
    w.text(v, right - w.width(v, size, bold), size, { font: bold, color: strong ? NAVY : INK });
    w.y -= size + 8;
  }
  w.y -= 10;

  for (const note of doc.notes ?? []) {
    w.block(safe(note), MARGIN, 9, contentWidth, { color: INK });
    w.y -= 4;
  }

  if (doc.payment) {
    const rows = doc.payment.rows;
    const h = 30 + rows.length * 14 + (doc.payment.link ? 52 : 0);
    w.need(h);
    w.y -= 6;
    w.text(safe(doc.payment.heading), MARGIN, 11, { font: bold, color: NAVY });
    w.y -= 18;
    for (const [k, v] of rows) {
      w.text(safe(k), MARGIN, 9, { color: MUTED });
      w.block(safe(v), MARGIN + 130, 9, contentWidth - 130, { font: bold, leading: 14 });
    }
    if (doc.payment.link) {
      w.y -= 8;
      w.link(safe(doc.payment.link.label), doc.payment.link.url, MARGIN, 10);
    }
    w.y -= 6;
  }

  if (doc.terms?.length) {
    w.need(30);
    w.y -= 4;
    w.text("TERMS", MARGIN, 7.5, { font: bold, color: MUTED });
    w.y -= 13;
    for (const t of doc.terms) w.block(safe(t), MARGIN, 8.5, contentWidth, { color: MUTED, leading: 12 });
  }

  w.finish();
  return Buffer.from(await pdf.save());
}
