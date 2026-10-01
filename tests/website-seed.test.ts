import { describe, expect, it } from "vitest";
import { legalFromMarkdown } from "../src/cms/seed/legal-markdown";
import { BW_LEGAL } from "../src/cms/seed/legal/bw";
import { quoteLayout, securityLayout } from "../src/cms/seed/pages";
import { DEFAULT_FOOTER, DEFAULT_HEADER } from "../src/cms/seed-frame";
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
  const gates = { onSale: () => true, helpOpen: true };

  it("uses the market's settings for anything the editor left empty, and hides empty social links", () => {
    const c = frameContent({}, footer, market, gates);
    expect(c.contact).toEqual({ email: "support@example.co.bw", phone: "+267 390 0000", hours: "Weekdays 8 to 5", address: null });
    expect(c.social).toEqual([]);
  });

  it("uses the editor's details and social links, even while the links fall back to the built-in footer", () => {
    const details = { contact: { email: "hello@example.co.bw", whatsapp: "+267 71 000 000", address: "Plot 1, Gaborone" }, social: { linkedin: "https://www.linkedin.com/company/x", facebook: " " } };
    const c = frameContent({}, footer, market, gates, details);
    expect(c.contact).toMatchObject({ email: "hello@example.co.bw", phone: "+267 390 0000", address: "Plot 1, Gaborone" });
    expect(c.social).toEqual([
      { label: "LinkedIn", href: "https://www.linkedin.com/company/x" },
      { label: "WhatsApp", href: "https://wa.me/26771000000" },
    ]);
  });
});

describe("the header's menus", () => {
  const market = { code: "bw", supportEmail: "support@example.co.bw", thebeUrl: null as string | null };
  const onSale = (products: unknown) => JSON.stringify(products).includes("business-email");

  it("hides links to products not on sale, to the help centre while it is empty, and to Thebe while its address isn't set", () => {
    const c = frameContent(DEFAULT_HEADER, DEFAULT_FOOTER, market, { onSale, helpOpen: false });
    const email = c.menus.find((m) => m.label === "Email")!;
    expect(email.columns.flatMap((col) => col.links.map((l) => l.label))).toEqual(["Business email", "Move your existing email"]);
    expect(c.menus.map((m) => m.label)).not.toContain("Expense management");
    const support = c.menus.find((m) => m.label === "Support")!;
    expect(support.right).toBe(true);
    expect(support.columns[0].links.map((l) => l.label)).toEqual(["Contact us", "Service status"]);
    expect(c.columns.find((col) => col.heading === "Support")!.links.map((l) => l.label)).not.toContain("Help centre");
    // The plans aren't on sale, so the header doesn't link to them.
    expect(c.links).toEqual([]);
  });

  it("shows Thebe's links and the help centre once they exist", () => {
    const plansToo = (products: unknown) => onSale(products) || JSON.stringify(products).includes("plan-grow");
    const c = frameContent(DEFAULT_HEADER, DEFAULT_FOOTER, { ...market, thebeUrl: "https://thebe.example.com" }, { onSale: plansToo, helpOpen: true });
    const thebe = c.menus.find((m) => m.label === "Expense management")!;
    expect(thebe.columns[0].links[0]).toMatchObject({ label: "Requests from anywhere", href: "https://thebe.example.com" });
    expect(c.menus.find((m) => m.label === "Support")!.columns[0].links[0]).toMatchObject({ label: "Help centre", href: "/bw/help" });
    expect(c.links).toEqual([{ label: "Plans", href: "/bw#plans" }]);
    expect(c.newsletter?.heading).toBe("Insights in your inbox, once a month.");
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
