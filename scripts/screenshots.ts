import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import sharp from "sharp";
import { PAGES, resolvePath, settled, type Audience, type PageSpec } from "../e2e/support/pages";
import { signIn } from "../e2e/support/signed-in";

/**
 * Screenshots of every page, at 390, 768, 1280 and 1440 px, light and dark,
 * as WebP, from a running console with the demo seed (npm run build && npm
 * start, not the dev server, whose overlay would show).
 *
 *   BASE_URL=http://localhost:3000 npm run screenshots              full set into screenshots-full/
 *   BASE_URL=http://localhost:3000 npm run screenshots -- --commit  also 390 and 1440 into docs/screenshots/
 *
 * CI uploads the full set as an artifact on every run; docs/screenshots/
 * holds the committed pair of widths for review in the repository.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = [390, 768, 1280, 1440];
const COMMITTED = [390, 1440];
const SCHEMES = ["light", "dark"] as const;
const FULL_DIR = "screenshots-full";
const DOCS_DIR = "docs/screenshots";
/** Long lists (150 setup tasks on a phone) are cut here; WebP stops at 16,383 px. */
const MAX_HEIGHT = 12_000;
const FOLDER: Record<Audience, string> = { public: "site", customer: "customer", staff: "staff" };

const commit = process.argv.includes("--commit");

async function resolveAll(browser: Browser): Promise<Map<PageSpec, string>> {
  const paths = new Map<PageSpec, string>();
  for (const audience of ["public", "customer", "staff"] as Audience[]) {
    const context = await browser.newContext();
    await signIn(context, audience, BASE);
    const page = await context.newPage();
    for (const spec of PAGES.filter((p) => p.audience === audience)) {
      const path = await resolvePath(page, spec, BASE);
      if (path) paths.set(spec, path);
      else console.warn(`Skipped ${spec.name}: the demo data has nothing to open.`);
    }
    await context.close();
  }
  return paths;
}

async function main() {
  const browser = await chromium.launch();
  const written: { spec: PageSpec; file: string; width: number; scheme: string }[] = [];
  try {
    const paths = await resolveAll(browser);
    for (const dir of [FULL_DIR, ...(commit ? [DOCS_DIR] : [])]) {
      rmSync(dir, { recursive: true, force: true });
      for (const f of Object.values(FOLDER)) mkdirSync(join(dir, f), { recursive: true });
    }
    for (const scheme of SCHEMES) {
      for (const width of WIDTHS) {
        for (const audience of ["public", "customer", "staff"] as Audience[]) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: "reduce", deviceScaleFactor: 1 });
          await signIn(context, audience, BASE);
          const page = await context.newPage();
          for (const spec of PAGES.filter((p) => p.audience === audience)) {
            const path = paths.get(spec);
            if (!path) continue;
            await page.goto(`${BASE}${path}`, { waitUntil: "load" });
            await settled(page);
            // Grow the window to the page's height rather than stitching a full-page
            // capture, so the sticky sidebar and header sit as they would on a tall screen.
            const height = Math.min(MAX_HEIGHT, await page.evaluate(() => document.documentElement.scrollHeight));
            await page.setViewportSize({ width, height: Math.max(height, 900) });
            const png = await page.screenshot({ type: "png" });
            await page.setViewportSize({ width, height: 900 });
            const file = `${FOLDER[audience]}/${spec.name}-${width}-${scheme}.webp`;
            const webp = await sharp(png).webp({ quality: 72 }).toBuffer();
            writeFileSync(join(FULL_DIR, file), webp);
            if (commit && COMMITTED.includes(width)) {
              writeFileSync(join(DOCS_DIR, file), webp);
              written.push({ spec, file, width, scheme });
            }
          }
          await context.close();
          console.log(`${scheme} ${width}px ${audience}: done`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (commit) writeIndex(written);
  const count = readdirSync(FULL_DIR, { recursive: true }).filter((f) => String(f).endsWith(".webp")).length;
  console.log(`${count} screenshots in ${FULL_DIR}/${commit ? `, ${written.length} in ${DOCS_DIR}/` : ""}`);
}

/** docs/screenshots/README.md: every committed screenshot, grouped by page, for review on GitHub. */
function writeIndex(written: { spec: PageSpec; file: string; width: number; scheme: string }[]) {
  const lines = [
    "# Screenshots",
    "",
    "Every page at 390 px and 1440 px wide, light and dark, with the demo data. Pages longer than 12,000 px are cut there. CI uploads the full set (390, 768, 1280 and 1440 px) as the `screenshots` artifact on every run.",
    "",
    "Refresh with `npm run screenshots -- --commit` against a running console with the demo seed (see the README).",
    "",
  ];
  for (const audience of ["public", "customer", "staff"] as Audience[]) {
    lines.push(`## ${{ public: "Public site and sign-in", customer: "Customer console", staff: "Staff console" }[audience]}`, "");
    lines.push("| Page | 390 light | 390 dark | 1440 light | 1440 dark |", "| --- | --- | --- | --- | --- |");
    for (const spec of PAGES.filter((p) => p.audience === audience)) {
      const shots = (w: number, s: string) => written.find((x) => x.spec === spec && x.width === w && x.scheme === s);
      if (!shots(390, "light")) continue;
      const cell = (w: number, s: string) => `[view](${shots(w, s)!.file})`;
      lines.push(`| ${spec.name} | ${cell(390, "light")} | ${cell(390, "dark")} | ${cell(1440, "light")} | ${cell(1440, "dark")} |`);
    }
    lines.push("");
  }
  writeFileSync(join(DOCS_DIR, "README.md"), lines.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
