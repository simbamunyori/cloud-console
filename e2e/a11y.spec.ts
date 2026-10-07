import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseTheme, PAGES, resolvePath, settled } from "./support/pages";
import { signIn } from "./support/signed-in";

/**
 * Change Request 01, section 5: WCAG 2.2 AA on every page, in both themes.
 * Fails on any axe violation, listing the rule, the element and the fix.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(async ({ context, baseURL }) => chooseTheme(context, scheme, baseURL!));

    for (const spec of PAGES) {
      test(`${spec.name} has no accessibility problems`, async ({ page, context, baseURL }) => {
        await signIn(context, spec.audience, baseURL!);
        const path = await resolvePath(page, spec, baseURL!);
        test.skip(!path, `The demo data has nothing to open for ${spec.name}.`);
        const response = await page.goto(path!);
        if (spec.audience !== "public") expect(new URL(page.url()).pathname, "stayed signed in").not.toMatch(/sign-in/);
        if (spec.name !== "not-found") expect(response?.status(), "page loaded").toBeLessThan(400);
        await settled(page);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const report = violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(" ")}\n  ${n.failureSummary?.replace(/\n/g, "\n  ")}`));
        expect(report, `axe on ${path}`).toEqual([]);
      });
    }
  });
}
