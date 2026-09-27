import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
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
  { name: "site-data-protection", audience: "public", path: "/bw/legal/data-protection" },
  { name: "not-found", audience: "public", path: "/no-such-page" },
  { name: "sign-in", audience: "public", path: "/sign-in" },
  { name: "sign-up", audience: "public", path: "/sign-up" },
  { name: "forgot-password", audience: "public", path: "/forgot-password" },
  { name: "reset-link-expired", audience: "public", path: "/reset-password/expired-example" },
  { name: "staff-sign-in", audience: "public", path: "/admin/sign-in" },

  { name: "home", audience: "customer", path: "/app" },
  { name: "marketplace", audience: "customer", path: "/app/marketplace" },
  { name: "product", audience: "customer", path: "/app/marketplace", follow: 'main a[href^="/app/marketplace/"]:not([href="/app/marketplace/domains"])' },
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
  { name: "security", audience: "customer", path: "/app/security" },
  { name: "settings", audience: "customer", path: "/app/settings" },

  { name: "admin-overview", audience: "staff", path: "/admin" },
  { name: "admin-customers", audience: "staff", path: "/admin/customers" },
  { name: "admin-customer", audience: "staff", path: "/admin/customers", follow: 'main a[href^="/admin/customers/"]' },
  { name: "admin-tasks", audience: "staff", path: "/admin/tasks" },
  { name: "admin-tickets", audience: "staff", path: "/admin/tickets" },
  { name: "admin-ticket", audience: "staff", path: "/admin/tickets", follow: 'main a[href^="/admin/tickets/"]' },
  { name: "admin-orders", audience: "staff", path: "/admin/orders" },
  { name: "admin-payments", audience: "staff", path: "/admin/payments" },
  { name: "admin-pricing", audience: "staff", path: "/admin/pricing" },
  { name: "admin-markets", audience: "staff", path: "/admin/markets" },
  { name: "admin-market", audience: "staff", path: "/admin/markets/bw" },
  { name: "admin-waitlist", audience: "staff", path: "/admin/waitlist" },
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
