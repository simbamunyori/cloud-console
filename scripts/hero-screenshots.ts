import { chromium } from "@playwright/test";
import sharp from "sharp";
import { DEMO_CUSTOMER, testSession } from "../e2e/support/sessions";

/**
 * The home page hero shows the real console with demo data. This takes
 * that picture, light and dark, from a running console (npm run dev or
 * start, with the demo seed loaded), into public/site/.
 *
 *   BASE_URL=http://localhost:3000 npm run screenshots:hero
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const cookie = await testSession(DEMO_CUSTOMER);
  const browser = await chromium.launch();
  try {
    for (const scheme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
      await context.addCookies([{ ...cookie, url: BASE }]);
      const page = await context.newPage();
      await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
      if (!new URL(page.url()).pathname.startsWith("/app")) throw new Error(`Expected the console, got ${page.url()}. Is the demo seed loaded?`);
      const png = await page.screenshot({ type: "png" });
      await sharp(png).webp({ quality: 82 }).toFile(`public/site/console-home-${scheme}.webp`);
      console.log(`public/site/console-home-${scheme}.webp`);
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
