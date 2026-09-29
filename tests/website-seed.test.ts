import { describe, expect, it } from "vitest";
import { legalFromMarkdown } from "../src/cms/seed/legal-markdown";
import { BW_LEGAL } from "../src/cms/seed/legal/bw";
import { securityLayout } from "../src/cms/seed/pages";

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
});
