/**
 * Lighthouse on the public pages, with the budgets from Change Request 01,
 * section 5: Google's "good" thresholds, and scores that fail the build if
 * missed. Runs against a started production build with the demo seed:
 *
 *   BASE_URL=http://localhost:3000 npx lhci autorun
 *
 * Each page runs three times and the median counts, so one slow run on a
 * shared CI machine doesn't fail the build. Mobile settings (Lighthouse's
 * default: a mid-range phone on a slow 4G connection).
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PAGES = ["/bw", "/bw/pricing", "/bw/security", "/bw/legal/privacy"];

module.exports = {
  ci: {
    collect: {
      url: PAGES.map((p) => `${BASE}${p}`),
      numberOfRuns: 3,
      // Devtools throttling slows the real page load down to the phone and
      // network below and measures it, rather than estimating from a fast
      // load, which counts every script that happened to finish first.
      settings: { chromeFlags: "--no-sandbox --headless=new", throttlingMethod: "devtools" },
    },
    assert: {
      aggregationMethod: "median-run",
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:seo": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci/reports" },
  },
};
