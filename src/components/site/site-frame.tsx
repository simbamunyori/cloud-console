import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/ui/logo";
import { company } from "@/config/app";
import { LEGAL_PAGES } from "@/config/site";
import { MarketSwitcher, type SwitcherMarket } from "./market-switcher";

export interface FrameMarket extends SwitcherMarket {
  supportEmail: string;
  supportPhone: string | null;
  supportHours: string;
  paymentMethods: string[];
}

const PAYMENT_WORDS: Record<string, string> = { card: "card", eft: "bank transfer" };

/**
 * The public site's header and footer around a page. `path` is the page
 * after the market ("", "/pricing"), so the switcher keeps you on it.
 */
export function SiteFrame({
  market,
  markets,
  path,
  signedIn,
  children,
}: {
  market: FrameMarket;
  markets: SwitcherMarket[];
  path: string;
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const base = `/${market.code}`;
  const pay = market.paymentMethods.map((p) => PAYMENT_WORDS[p] ?? p);
  return (
    <div className="flex min-h-dvh flex-col bg-surface-0 text-ink-body">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-1 focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface-1/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-content items-center gap-2 px-4 sm:gap-6 sm:px-6">
          <Link href={base} className="flex shrink-0 items-center rounded-sm" aria-label={`${company.name} home`}>
            <LogoMark size={32} className="sm:hidden" title="" />
            <Logo height={36} className="hidden sm:inline-flex" />
          </Link>
          <nav aria-label="Site" className="hidden flex-1 items-center gap-1 md:flex">
            <Link href={`${base}#services`} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2">
              Services
            </Link>
            <Link href={`${base}/pricing`} aria-current={path === "/pricing" ? "page" : undefined} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2 aria-[current=page]:text-link">
              Pricing
            </Link>
            <Link href={`${base}/security`} aria-current={path === "/security" ? "page" : undefined} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2 aria-[current=page]:text-link">
              Security
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <MarketSwitcher markets={markets} current={market} path={path} />
            {signedIn ? (
              <Button asChild size="md">
                <Link href="/app">Open console</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="md" className="hidden sm:inline-flex">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="md">
                  <Link href="/sign-up">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
        <nav aria-label="Site, small screens" className="mx-auto flex max-w-content gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          <Link href={`${base}#services`} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2">
            Services
          </Link>
          <Link href={`${base}/pricing`} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2">
            Pricing
          </Link>
          <Link href={`${base}/security`} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2">
            Security
          </Link>
          {signedIn ? null : (
            <Link href="/sign-in" className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="bg-navy text-ink-on-dark">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href={base} aria-label={`${company.name} home`} className="w-fit rounded-sm">
              <LogoMark size={40} onDark title="" />
            </Link>
            <p className="text-callout">{company.tagline}</p>
            <MarketSwitcher markets={markets} current={market} path={path} align="start" tone="navy" />
          </div>
          <nav aria-labelledby="footer-services" className="flex flex-col gap-3">
            <h2 id="footer-services" className="text-callout font-semibold text-on-navy">
              Services
            </h2>
            <Link href={`${base}#services`} className="text-callout hover:text-on-navy hover:underline">
              What we manage
            </Link>
            <Link href={`${base}/pricing`} className="text-callout hover:text-on-navy hover:underline">
              Pricing
            </Link>
            <Link href="/sign-up" className="text-callout hover:text-on-navy hover:underline">
              Get started
            </Link>
            <Link href="/sign-in" className="text-callout hover:text-on-navy hover:underline">
              Sign in
            </Link>
          </nav>
          <nav aria-labelledby="footer-company" className="flex flex-col gap-3">
            <h2 id="footer-company" className="text-callout font-semibold text-on-navy">
              Company
            </h2>
            <Link href={`${base}/security`} className="text-callout hover:text-on-navy hover:underline">
              Security and data protection
            </Link>
            {Object.entries(LEGAL_PAGES).map(([kind, title]) => (
              <Link key={kind} href={`${base}/legal/${kind}`} className="text-callout hover:text-on-navy hover:underline">
                {title}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-3">
            <h2 className="text-callout font-semibold text-on-navy">Talk to us</h2>
            <a href={`mailto:${market.supportEmail}`} className="text-callout break-all hover:text-on-navy hover:underline">
              {market.supportEmail}
            </a>
            {market.supportPhone ? (
              <a href={`tel:${market.supportPhone.replace(/\s/g, "")}`} className="text-callout hover:text-on-navy hover:underline">
                {market.supportPhone}
              </a>
            ) : null}
            <p className="text-callout">{market.supportHours}</p>
            {pay.length ? <p className="text-callout">Pay by {pay.join(" or ")}.</p> : null}
          </div>
        </div>
        <div className="border-t border-on-navy/10">
          <p className="mx-auto max-w-content px-4 py-6 text-caption sm:px-6">
            © {new Date().getFullYear()} {company.legalName}
          </p>
        </div>
      </footer>
    </div>
  );
}
