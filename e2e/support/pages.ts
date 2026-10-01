import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashToken, newToken } from "../../src/server/auth/tokens";
import { answersOf, readinessScore } from "../../src/server/tools/readiness";
import { DEMO_CUSTOMER } from "./sessions";

/**
 * Every page the accessibility checks and screenshots visit. A page with
 * `follow` is reached through the first link matching that selector on
 * its `path` page, so detail pages use whatever the demo seed has.
 */
export type Audience = "public" | "customer" | "staff";

export interface PageSpec {
  name: string;
  audience: Audience;
  path: string;
  follow?: string;
}

export const PAGES: PageSpec[] = [
  { name: "site-home", audience: "public", path: "/bw" },
  { name: "site-pricing", audience: "public", path: "/bw/pricing" },
  { name: "site-security", audience: "public", path: "/bw/security" },
  { name: "site-privacy", audience: "public", path: "/bw/legal/privacy" },
  { name: "site-terms", audience: "public", path: "/bw/legal/terms" },
  { name: "site-refunds", audience: "public", path: "/bw/legal/refunds" },
  { name: "site-service-providers", audience: "public", path: "/bw/legal/service-providers" },
  { name: "not-found", audience: "public", path: "/no-such-page" },
  { name: "sign-in", audience: "public", path: "/sign-in" },
  { name: "sign-up", audience: "public", path: "/sign-up" },
  { name: "forgot-password", audience: "public", path: "/forgot-password" },
  { name: "reset-link-expired", audience: "public", path: "/reset-password/expired-example" },
  { name: "staff-sign-in", audience: "public", path: "/admin/sign-in" },
  { name: "site-quote", audience: "public", path: "/bw/quote" },
  { name: "site-product", audience: "public", path: "/bw/products/microsoft-365-business-standard" },
  { name: "site-insights", audience: "public", path: "/bw/insights" },
  { name: "site-insight", audience: "public", path: "/bw/insights/why-we-offer-microsoft-365-business-standard" },
  { name: "quote-link", audience: "public", path: "quote-link:" },
  { name: "site-tools", audience: "public", path: "/bw/tools" },
  { name: "site-email-check", audience: "public", path: "/bw/tools/email-security?domain=kgalehill.example" },
  { name: "site-cost-calculator", audience: "public", path: "/bw/tools/cost-calculator?users=12&provider=either&need=archive" },
  { name: "site-readiness", audience: "public", path: "/bw/tools/data-protection" },
  { name: "site-readiness-result", audience: "public", path: "readiness:" },
  { name: "site-book", audience: "public", path: "/bw/book" },

  { name: "home", audience: "customer", path: "/app" },
  { name: "search", audience: "customer", path: "/app/search?q=backup" },
  { name: "marketplace", audience: "customer", path: "/app/marketplace" },
  { name: "product", audience: "customer", path: "/app/marketplace", follow: 'main a[href^="/app/marketplace/"]:not([href="/app/marketplace/domains"])' },
  { name: "quotes", audience: "customer", path: "/app/quotes" },
  { name: "quote", audience: "customer", path: "/app/quotes", follow: 'main a[href^="/app/quotes/QUO-"]' },
  { name: "new-quote", audience: "customer", path: "/app/quotes/new" },
  { name: "domains", audience: "customer", path: "/app/marketplace/domains?q=kgalehill" },
  { name: "services", audience: "customer", path: "/app/services" },
  { name: "service", audience: "customer", path: "/app/services", follow: 'main a[href^="/app/services/"]' },
  { name: "billing", audience: "customer", path: "/app/billing" },
  { name: "invoice", audience: "customer", path: "/app/billing", follow: 'main a[href^="/app/billing/invoices/"]' },
  { name: "statements", audience: "customer", path: "/app/billing/statements" },
  { name: "payment-methods", audience: "customer", path: "/app/billing/payment-methods" },
  { name: "order", audience: "customer", path: "order:" },
  { name: "support", audience: "customer", path: "/app/support" },
  { name: "ticket", audience: "customer", path: "/app/support", follow: 'main a[href^="/app/support/tickets/"]' },
  { name: "new-ticket", audience: "customer", path: "/app/support/new" },
  { name: "assistant", audience: "customer", path: "/app/support/assistant" },
  { name: "team", audience: "customer", path: "/app/team" },
  { name: "licences", audience: "customer", path: "/app/licences" },
  { name: "spend", audience: "customer", path: "/app/spend" },
  { name: "security", audience: "customer", path: "/app/security" },
  { name: "settings", audience: "customer", path: "/app/settings" },

  { name: "admin-overview", audience: "staff", path: "/admin" },
  { name: "admin-customers", audience: "staff", path: "/admin/customers" },
  { name: "admin-customer", audience: "staff", path: "/admin/customers", follow: 'main a[href^="/admin/customers/"]' },
  { name: "admin-tasks", audience: "staff", path: "/admin/tasks" },
  { name: "admin-tickets", audience: "staff", path: "/admin/tickets" },
  { name: "admin-ticket", audience: "staff", path: "/admin/tickets", follow: 'main a[href^="/admin/tickets/"]' },
  { name: "admin-orders", audience: "staff", path: "/admin/orders" },
  { name: "admin-quotes", audience: "staff", path: "/admin/quotes" },
  { name: "admin-quote", audience: "staff", path: "/admin/quotes", follow: 'main a[href^="/admin/quotes/QUO-"]' },
  { name: "admin-leads", audience: "staff", path: "/admin/leads" },
  { name: "admin-bookings", audience: "staff", path: "/admin/bookings" },
  { name: "admin-lead", audience: "staff", path: "/admin/leads", follow: 'main a[href^="/admin/leads/LEAD-"]' },
  { name: "admin-launch-kits", audience: "staff", path: "/admin/launch-kits" },
  { name: "admin-launch-kit", audience: "staff", path: "/admin/launch-kits", follow: 'main a[href^="/admin/launch-kits/"]' },
  { name: "admin-newsletter", audience: "staff", path: "/admin/newsletter" },
  { name: "admin-newsletter-issue", audience: "staff", path: "/admin/newsletter", follow: 'main a[href^="/admin/newsletter/"]' },
  { name: "admin-payments", audience: "staff", path: "/admin/payments" },
  { name: "admin-catalogue", audience: "staff", path: "/admin/catalogue" },
  { name: "admin-catalogue-product", audience: "staff", path: "/admin/catalogue/products/managed-vps-small" },
  { name: "admin-catalogue-new-product", audience: "staff", path: "/admin/catalogue/products/new" },
  { name: "admin-catalogue-preview", audience: "staff", path: "/admin/catalogue/products/local-data-copy/preview?market=bw" },
  { name: "admin-catalogue-family", audience: "staff", path: "/admin/catalogue/families/servers" },
  { name: "admin-cloud-usage", audience: "staff", path: "/admin/cloud-usage" },
  { name: "admin-pricing", audience: "staff", path: "/admin/pricing" },
  { name: "admin-markets", audience: "staff", path: "/admin/markets" },
  { name: "admin-market", audience: "staff", path: "/admin/markets/bw" },
  { name: "admin-waitlist", audience: "staff", path: "/admin/waitlist" },
  { name: "admin-staff", audience: "staff", path: "/admin/staff" },
  { name: "admin-website-access", audience: "staff", path: "/admin/website-access" },
  { name: "admin-account", audience: "staff", path: "/admin/account" },
];

/** The address to open for a page, following its link or looking up the demo customer's latest order. */
export async function resolvePath(page: Page, spec: PageSpec, base: string): Promise<string | null> {
  if (spec.path === "order:") {
    const db = new PrismaClient();
    try {
      const order = await db.order.findFirst({
        where: { organisation: { memberships: { some: { user: { email: DEMO_CUSTOMER } } } } },
        orderBy: { createdAt: "desc" },
        select: { reference: true },
      });
      return order ? `/app/orders/${order.reference}` : null;
    } finally {
      await db.$disconnect();
    }
  }
  if (spec.path === "quote-link:") {
    // The demo organisation's sent quote, with a fresh link as its email would carry.
    const db = new PrismaClient();
    try {
      const quote = await db.quote.findFirst({ where: { status: "SENT", organisation: { memberships: { some: { user: { email: DEMO_CUSTOMER } } } } }, orderBy: { createdAt: "desc" } });
      if (!quote) return null;
      const token = newToken();
      await db.quote.update({ where: { id: quote.id }, data: { tokenHash: hashToken(token) } });
      return `/quote/${token}`;
    } finally {
      await db.$disconnect();
    }
  }
  if (spec.path === "readiness:") {
    // A saved checklist result, as the visitor's own link opens it.
    const db = new PrismaClient();
    try {
      const token = newToken();
      const answers = {
        inventory: "yes",
        officer: "partly",
        notice: "no",
        consent: "partly",
        access: "yes",
        devices: "no",
        backup: "partly",
        breach: "no",
        suppliers: "partly",
        transfers: "no",
        retention: "no",
        training: "partly",
      };
      await db.readinessCheck.create({ data: { token, market: "bw", answers, score: readinessScore(answersOf(answers)), purgeAfter: new Date(Date.now() + 86_400_000) } });
      return `/bw/tools/data-protection/${token}`;
    } finally {
      await db.$disconnect();
    }
  }
  if (!spec.follow) return spec.path;
  await page.goto(`${base}${spec.path}`);
  const href = await page.locator(spec.follow).first().getAttribute("href", { timeout: 15_000 }).catch(() => null);
  return href;
}

/** Waits for a page to finish streaming: no loading skeleton left, fonts in. */
export async function settled(page: Page) {
  await page.locator("[data-loading]").first().waitFor({ state: "detached", timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}
