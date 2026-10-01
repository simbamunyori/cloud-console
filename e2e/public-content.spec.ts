import { expect, test } from "@playwright/test";
import { PAGES, resolvePath } from "./support/pages";

/**
 * Milestone 10: nothing empty or unfinished reaches the public site. Every
 * public page is read as a visitor sees it, and fails on the marks a
 * placeholder leaves. Draft legal text is the one exception: it carries its
 * own "draft for legal review" notice until a Publisher approves it, and the
 * staff Launch checks page lists it until then.
 */

const MARKS: [string, RegExp][] = [
  ["a bracketed blank like [X]", /\[[A-Za-z ]{1,24}\]/],
  ["coming soon", /coming soon/i],
  ["lorem ipsum", /lorem ipsum/i],
  ["TBC or TBD", /\bTB[CD]\b/],
  ["the word placeholder", /\bplaceholder\b/i],
  ["a broken value", /\bundefined\b|\bNaN\b|\[object Object\]/],
  ["an exclamation mark in copy", /[A-Za-z]!(\s|$)/],
  ["an em dash", /—/],
  ["the wrong company name", /4th Generations?/i],
];

for (const spec of PAGES.filter((p) => p.audience === "public")) {
  test(`${spec.name} shows no placeholder or unfinished content`, async ({ page, baseURL }) => {
    const path = await resolvePath(page, spec, baseURL!);
    test.skip(!path, "Nothing in the demo data to open");
    await page.goto(path!);
    const text = await page.locator("body").innerText();
    for (const [what, mark] of MARKS) {
      expect(mark.exec(text)?.[0] ?? null, `${spec.name} has ${what}`).toBeNull();
    }
  });
}
