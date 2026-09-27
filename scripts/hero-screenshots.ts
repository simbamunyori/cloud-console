import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";
import { settled } from "../e2e/support/pages";
import { signIn } from "../e2e/support/signed-in";

/**
 * The public site shows the real console with demo data. This takes those
 * pictures, light and dark, from a running console (npm run dev or start,
 * with the demo seed loaded), into public/site/:
 *
 * - console-home-*: the Home page at 2x, for the hero on wide screens;
 * - console-home-*-crop-*: a close-up of the top of Home, for phones;
 * - console-invoice-*: the latest monthly invoice, for the Cloud Console section.
 *
 *   BASE_URL=http://localhost:3000 npm run screenshots:hero
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function sizes(png: Buffer, name: string, widths: number[]) {
  for (const width of widths) await sharp(png).resize({ width }).webp({ quality: 82 }).toFile(`public/site/${name}-${width}.webp`);
  console.log(`public/site/${name}-{${widths.join(",")}}.webp`);
}

async function mainBox(page: Page) {
  const box = await page.locator("main").first().boundingBox();
  if (!box) throw new Error("No main element.");
  return box;
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const scheme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
      await signIn(context, "customer", BASE);
      const page = await context.newPage();
      await page.goto(`${BASE}/app`);
      await settled(page);
      if (!new URL(page.url()).pathname.startsWith("/app")) throw new Error(`Expected the console, got ${page.url()}. Is the demo seed loaded?`);
      await sizes(await page.screenshot({ type: "png" }), `console-home-${scheme}`, [960, 1280, 1920, 2560]);

      // The top of the page beside the sidebar: the totals and what needs attention, readable on a phone.
      const home = await mainBox(page);
      await sizes(await page.screenshot({ type: "png", clip: { x: home.x, y: 0, width: 640, height: 480 } }), `console-home-${scheme}-crop`, [640, 960, 1280]);

      // The newest monthly invoice: the first invoice in the list whose page compares it with last month.
      await page.goto(`${BASE}/app/billing`);
      await settled(page);
      const hrefs = await page.locator('a[href^="/app/billing/invoices/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
      let found = false;
      for (const href of hrefs) {
        await page.goto(`${BASE}${href}`);
        await settled(page);
        if (await page.getByText(/compared with last month|The same as last month/).count()) {
          found = true;
          break;
        }
      }
      if (!found) throw new Error("No monthly invoice with a comparison in the demo data.");
      await page.setViewportSize({ width: 1280, height: 1000 });
      const invoice = await mainBox(page);
      await sizes(await page.screenshot({ type: "png", clip: { x: invoice.x, y: 0, width: invoice.width, height: 760 } }), `console-invoice-${scheme}`, [640, 960, 1280]);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
