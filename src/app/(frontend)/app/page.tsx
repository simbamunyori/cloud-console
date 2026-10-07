import type { Metadata } from "next";
import { ArrowRight, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { AccountContactCard } from "@/components/app/account-contact";
import { HomeView } from "@/components/app/home-view";
import { WelcomeChecklist } from "@/components/app/welcome-checklist";
import { accountContact, welcomeChecklist } from "@/server/experience/experience";
import { money } from "@/lib/domain/money";
import { requireBilling } from "@/server/billing/context";
import { tenantOverview, unusedLicences } from "@/server/licences/licences";
import { securityFacts } from "@/server/org/security-facts";
import { securityChecks } from "@/server/org/security-score";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { homeChecks, type ScoreCheck } from "@/server/security/score";
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
  // STRATEGY_ROLLOUT U4: the full score once it is on and this account has been scored.
  const profile = (await featureOn(prisma, "security-score"))
    ? await db.securityProfile.findFirst({ select: { score: true, checks: true } })
    : null;
  const full =
    profile?.score != null && Array.isArray(profile.checks)
      ? { score: profile.score, checks: homeChecks(profile.checks as unknown as ScoreCheck[]) }
      : null;
  const checks =
    full?.checks ??
    securityChecks(await securityFacts(db, actor.userId, live, today));
  const cart = await readCart();
  // STRATEGY_ROLLOUT U11: the first-week checklist and the named account contact, each behind its switch.
  const [welcome, contact] = await Promise.all([
    welcomeChecklist(prisma, db, { organisationId: organisation.id, actor, liveServices: live.length }),
    accountContact(prisma, organisation.id),
  ]);

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
        fullScore={full?.score}
        intro={welcome ? <WelcomeChecklist items={welcome.items} done={welcome.done} /> : undefined}
        contact={contact ? <AccountContactCard contact={contact} /> : undefined}
      />
    </>
  );
}
