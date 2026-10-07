import { HomeView } from "@/components/app/home-view";
import { SecurityScoreCard } from "@/components/app/security-score";
import { Logo } from "@/components/ui/logo";
import { demoAmount } from "@/config/demo";
import { addDays, startOfMonth } from "@/lib/dates";
import type { Domain, InvoiceSummary, Service } from "@/server/billing/adapter";
import { attentionItems } from "@/server/billing/views";
import { securityChecks } from "@/server/org/security-score";

/**
 * The real console Home and Security components with demo data for Kgale
 * Logistics, in the market's currency: what a customer sees after
 * signing up. Not an image, so it is always the current console. The
 * demo is inert (nothing in it can be focused or clicked) and described
 * in words for screen readers.
 */

export interface DemoMarket {
  locale: string;
  currency: string;
  /** The market's time zone's today, so dates read naturally. */
  today: Date;
}

/** Demo amounts are written in whole BWP and shown at a round rate in the market's currency. */
const amount = (bwp: number, currency: string) => demoAmount(BigInt(bwp) * 100n, currency);

function demoAccount({ currency, today }: DemoMarket) {
  const m = (bwp: number) => amount(bwp, currency);
  const next = startOfMonth(addDays(startOfMonth(today), 32));
  const svc = (id: string, name: string, groupName: string, bwp: number, quantity = 1): Service => ({
    serviceId: id,
    productId: id,
    name,
    groupName,
    status: "active",
    quantity,
    recurring: m(bwp),
    billingCycle: "monthly",
    registeredOn: addDays(today, -200),
    nextDueOn: next,
    details: {} as Service["details"],
  });
  const services = [svc("demo-m365", "Microsoft 365 Business Standard", "Email and documents", 2150, 8), svc("demo-web", "Website", "WordPress hosting", 450), svc("demo-backup", "Backup for Microsoft 365", "Protection", 560), svc("demo-mdr", "Threat monitoring", "Protection", 510)];
  const domains: Domain[] = [
    { domainId: "demo-dom", name: "kgalelogistics.co.bw", registrar: "demo", status: "active", registeredOn: addDays(today, -344), expiresOn: addDays(today, 21), nextDueOn: addDays(today, 21), renewal: m(250), registrationYears: 1, autoRenew: true },
  ];
  const invoices: InvoiceSummary[] = [
    { invoiceId: "demo-12", number: "INV-2026-0012", issuedOn: addDays(today, -7), dueOn: today, status: "unpaid", total: m(420) },
    { invoiceId: "demo-11", number: "INV-2026-0011", issuedOn: addDays(today, -37), dueOn: addDays(today, -30), paidOn: addDays(today, -31), status: "paid", total: m(3670) },
    { invoiceId: "demo-10", number: "INV-2026-0010", issuedOn: addDays(today, -68), dueOn: addDays(today, -61), paidOn: addDays(today, -62), status: "paid", total: m(3670) },
  ];
  const checks = securityChecks({ withoutTwoStep: 0, backupCodesLeft: 2, inactiveMembers: 0, admins: 2, hasProductivity: true, hasMailboxBackup: true, hasThreatMonitoring: true });
  return { services, domains, invoices, checks };
}

const NAV = ["Home", "Services", "Marketplace", "Billing", "Security", "Support", "Team"];

/** The console window's frame: the top bar and, on wide screens, the side menu. White in both themes, like every product screen. */
function Chrome({ title, children, nav = false }: { title: string; children: React.ReactNode; nav?: boolean }) {
  return (
    <div data-surface="light" className="overflow-hidden rounded-lg border border-site-frame bg-surface-0 text-left">
      <div className="flex h-10 items-center gap-3 border-b border-border bg-surface-1 px-4 text-caption text-ink-muted">
        <Logo height={20} />
        <span className="ml-auto truncate">{title}</span>
      </div>
      <div className="flex">
        {nav ? (
          <ul className="hidden w-50 shrink-0 flex-col gap-1 border-r border-border bg-surface-1 px-3.5 py-5 text-callout lg:flex">
            {NAV.map((n, i) => (
              <li key={n} className={i === 0 ? "rounded-lg bg-brand-soft px-3 py-2 font-semibold text-link" : "px-3 py-2 text-ink"}>
                {n}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="min-w-0 flex-1 p-4 sm:p-5.5">{children}</div>
      </div>
    </div>
  );
}

/** The console Home for Kgale Logistics, under the hero. */
export function ConsoleHomeDemo({ market, description }: { market: DemoMarket; description: string }) {
  const demo = demoAccount(market);
  const attention = attentionItems(demo.invoices, demo.services, demo.domains, market.today, market.locale);
  return (
    <figure className="m-0">
      <div inert aria-hidden className="select-none">
        <Chrome title="Kgale Logistics" nav>
          <HomeView organisationName="Kgale Logistics" firstName="Neo" today={market.today} currency={market.currency} locale={market.locale} {...demo} attention={attention} demo />
        </Chrome>
      </div>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}

/** The console's security score for Kgale Logistics, every check listed. */
export function ConsoleSecurityDemo({ market }: { market: DemoMarket }) {
  const { checks } = demoAccount(market);
  return (
    <figure className="m-0">
      <div inert aria-hidden className="select-none">
        <Chrome title="Security">
          <SecurityScoreCard checks={checks} everyCheck demo />
        </Chrome>
      </div>
      <figcaption className="sr-only">The console&apos;s security score for a demo customer: 90 out of 100, with two-step login on for everyone, email backed up and threats watched.</figcaption>
    </figure>
  );
}
