/**
 * The website editor's first content: the pages, legal text, header and
 * footer the site showed before it (src/cms/seed), and on development and
 * demo databases the demo insights (src/cms/seed/demo-insights.ts).
 * A server does this itself when it starts with an empty editor; this is
 * for a development database. Safe to rerun.
 *
 *   npm run cms:seed
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { seedWebsite } from "@/cms/seed";
import { seedDemoInsights } from "@/cms/seed/demo-insights";
import { prisma } from "@/server/db";
import { prepareIssues } from "@/server/newsletter/issues";

process.env.CONSOLE_JOBS = "off";
getPayload({ config })
  .then(async (payload) => {
    const done = await seedWebsite(payload);
    // Demo data only: refused in production unless SEED_DEMO=yes, like the demo accounts.
    const demo = await seedDemoInsights(payload, prisma);
    const issues = demo ? await prepareIssues({ db: prisma, payload }) : 0;
    return [done, demo ? `Added ${demo}${issues ? ` and ${issues} newsletter issue${issues === 1 ? "" : "s"}` : ""}.` : null].filter(Boolean).join(" ") || null;
  })
  .then((done) => {
    console.log(done ?? "The website editor already has its first content. Left as it is.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
