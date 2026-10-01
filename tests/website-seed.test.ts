import { describe, expect, it } from "vitest";
import { legalFromMarkdown } from "../src/cms/seed/legal-markdown";
import { BW_LEGAL } from "../src/cms/seed/legal/bw";
import { quoteLayout, securityLayout } from "../src/cms/seed/pages";
import { frameContent } from "../src/components/site/frame-content";
import { fill } from "../src/components/site/rich-text";
import { readingMinutes } from "../src/cms/collections/insights";

const text = (node: unknown): string => {
  const n = node as { text?: string; children?: unknown[] };
  return (n.text ?? "") + (n.children ?? []).map(text).join("");
};

describe("the website editor's first content", () => {
  it("turns the legal drafts into rich text, with the banner and date as their own fields", () => {
    for (const [kind, md] of Object.entries(BW_LEGAL)) {
      const doc = legalFromMarkdown(md);
      expect(doc.title, kind).not.toBe("");
      expect(doc.draftNotice, kind).toMatch(/^DRAFT FOR LEGAL REVIEW/);
      expect(doc.updated, kind).toMatch(/^Last updated:/);
      expect(text(doc.body.root), kind).not.toMatch(/DRAFT FOR LEGAL REVIEW|Last updated:|\*\*/);
    }
  });

  it("makes links from Markdown links and email addresses", () => {
    const { body } = legalFromMarkdown("See our [data protection page](/bw/legal/data-protection) or write to help@example.co.bw.");
    const links = JSON.stringify(body).match(/"url":"[^"]+"/g);
    expect(links).toEqual(['"url":"/bw/legal/data-protection"', '"url":"mailto:help@example.co.bw"']);
    expect(text(body.root)).toBe("See our data protection page or write to help@example.co.bw.");
  });

  it("names the data protection law only in markets that have one", () => {
    const words = (m: string) => JSON.stringify(securityLayout(m));
    expect(words("bw")).toContain("{data-protection-law}");
    expect(words("global")).not.toContain("{data-protection-law}");
    expect(words("za")).toContain("/za/legal/data-protection");
  });

  it("makes numbered lists, and the quote page's words name the market's currency", () => {
    const { body } = legalFromMarkdown("1. First\n2. Second");
    expect(JSON.stringify(body)).toContain('"listType":"number"');
    expect(text(body.root)).toBe("FirstSecond");
    const intro = quoteLayout().find((b) => b.blockType === "pageIntro") as { intro: string };
    expect(fill(intro.intro, { name: "Botswana", supportEmail: "s@example.co.bw", currency: "BWP" })).toContain("a quote in BWP");
  });
});

describe("the footer's contact details", () => {
  const market = { code: "bw", supportEmail: "support@example.co.bw", supportPhone: "+267 390 0000", supportHours: "Weekdays 8 to 5" };
  const footer = { columns: [{ heading: "Company", links: [] }] };

  it("uses the market's settings for anything the editor left empty, and hides empty social links", () => {
    const c = frameContent({}, footer, market);
    expect(c.contact).toEqual({ email: "support@example.co.bw", phone: "+267 390 0000", hours: "Weekdays 8 to 5", address: null });
    expect(c.social).toEqual([]);
  });

  it("uses the editor's details and social links, even while the links fall back to the built-in footer", () => {
    const details = { contact: { email: "hello@example.co.bw", whatsapp: "+267 71 000 000", address: "Plot 1, Gaborone" }, social: { linkedin: "https://www.linkedin.com/company/x", facebook: " " } };
    const c = frameContent({}, footer, market, details);
    expect(c.contact).toMatchObject({ email: "hello@example.co.bw", phone: "+267 390 0000", address: "Plot 1, Gaborone" });
    expect(c.social).toEqual([
      { label: "LinkedIn", href: "https://www.linkedin.com/company/x" },
      { label: "WhatsApp", href: "https://wa.me/26771000000" },
    ]);
  });
});

describe("insights", () => {
  it("reads at 200 words a minute, never less than one", () => {
    const body = (n: number) => ({ root: { children: [{ type: "paragraph", children: [{ type: "text", text: Array(n).fill("w").join(" ") }] }] } });
    expect(readingMinutes(body(10))).toBe(1);
    expect(readingMinutes(body(1000))).toBe(5);
    expect(readingMinutes(null)).toBe(1);
  });
});
