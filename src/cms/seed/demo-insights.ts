import type { Payload } from "payload";
import type { PrismaClient } from "@prisma/client";
import { richFromMarkdown } from "./legal-markdown";

/**
 * Demo insights for development, CI and demo servers (never production
 * unless SEED_DEMO=yes): two published articles, one from last month so
 * the newsletter has an issue to prepare, and the demo launch kit's
 * article linked to its product.
 */

const DEMO = [
  {
    slug: "backups-you-have-tested",
    title: "A backup you haven't restored is a hope, not a plan",
    topic: "resilience" as const,
    summary: "Most businesses find out their backup doesn't work on the day they need it. A monthly test restore takes an hour and removes the doubt.",
    related: { categories: [], products: ["backup-microsoft-365"] },
    monthsAgo: 1,
    markdown:
      "## Why backups fail\n\nA backup job that reports success can still leave you without your files. Passwords change, storage fills up and a folder is left out.\n\n## What a test restore shows\n\nOnce a month, restore one mailbox and one folder to a separate place and open a few files. If they open, the backup works.\n\n## How we do it\n\nWe restore from every customer's backup each month and keep a record of the result.",
  },
  {
    slug: "why-we-offer-microsoft-365-business-standard",
    title: "Why we offer Microsoft 365 Business Standard",
    topic: "productivity" as const,
    summary: "Email on your own name, the Office desktop apps and Teams, set up and looked after by people you can call.",
    related: { categories: [], products: ["microsoft-365-business-standard"] },
    monthsAgo: 0,
    markdown:
      "## The problem it solves\n\nSmall teams often run on personal email addresses and shared passwords. It works until someone leaves.\n\n## What it includes\n\nEmail on your own domain, Word, Excel, PowerPoint and Outlook on up to five computers per person, and Teams for meetings.\n\n## How it fits with our other services\n\nAdd daily email backup and email security, and everything is on one monthly invoice.",
  },
];

export async function seedDemoInsights(payload: Payload, db: PrismaClient, now = new Date()): Promise<string | null> {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "yes") return null;
  let added = 0;
  for (const d of DEMO) {
    const { totalDocs } = await payload.count({ collection: "insights", where: { slug: { equals: d.slug } }, overrideAccess: true });
    if (totalDocs) continue;
    const publishedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - d.monthsAgo, d.monthsAgo ? 14 : 1, 8)).toISOString();
    const doc = await payload.create({
      collection: "insights",
      data: { title: d.title, slug: d.slug, topic: d.topic, summary: d.summary, related: d.related, publishedAt, body: richFromMarkdown(d.markdown) as never, _status: "published" },
      overrideAccess: true,
    });
    added++;
    // The demo launch kit's article.
    const product = d.related.products[0];
    await db.launchKit.updateMany({ where: { product: { slug: product }, insightId: null }, data: { insightId: String(doc.id) } });
  }
  return added ? `${added} demo insights` : null;
}
