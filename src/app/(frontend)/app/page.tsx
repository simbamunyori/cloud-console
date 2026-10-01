import type { Metadata } from "next";
import { ArrowRight, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { HomeView } from "@/components/app/home-view";
import { money } from "@/lib/domain/money";
import { requireBilling } from "@/server/billing/context";
import { tenantOverview, unusedLicences } from "@/server/licences/licences";
import { securityFacts } from "@/server/org/security-facts";
import { securityChecks } from "@/server/org/security-score";
import { attentionItems } from "@/server/billing/views";
import { readCart } from "@/server/site/cart";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const { organisation, actor, billing, db, today, currency, locale } =
    await requireBilling();
  const [services, domains, invoices, tenants] = await Promise.all([
    billing.listServices(),
    billing.listDomains(),
    billing.listInvoices(),
    tenantOverview(db),
  ]);

  const live = services.filter(
    (s) => s.status !== "cancelled" && s.status !== "terminated",
  );
  const tips = await db.savingTip.findMany({
    where: { status: "OPEN", currency },
    select: { monthlyMinor: true },
  });
  const savings = tips.length
    ? {
        count: tips.length,
        monthly: money(
          tips.reduce((n, t) => n + t.monthlyMinor, 0n),
          currency,
        ),
      }
    : null;
  const attention = attentionItems(
    invoices,
    services,
    domains,
    today,
    locale,
    unusedLicences(tenants),
    savings,
  );
  const checks = securityChecks(
    await securityFacts(db, actor.userId, live, today),
  );
  const cart = await readCart();

  return (
    <>
      {cart.length ? (
        <Link
          href="/app/cart"
          className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-4 text-ink hover:bg-surface-2"
        >
          <ShoppingCart aria-hidden className="size-5 text-link" />
          <span className="flex-1">
            {cart.length === 1 ? "1 domain" : `${cart.length} domains`} from our
            website {cart.length === 1 ? "is" : "are"} in your cart.
          </span>
          <span className="flex items-center gap-1 font-semibold text-link">
            Register {cart.length === 1 ? "it" : "them"}{" "}
            <ArrowRight aria-hidden className="size-4" />
          </span>
        </Link>
      ) : null}
      <HomeView
        organisationName={organisation.name}
        firstName={actor.name.split(" ")[0]}
        today={today}
        currency={currency}
        locale={locale}
        services={services}
        domains={domains}
        invoices={invoices}
        attention={attention}
        checks={checks}
      />
    </>
  );
}
