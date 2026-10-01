/* eslint-disable @next/next/no-img-element -- the brand SVG lockups are fixed-size files. */
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { company } from "@/config/app";
import type { Theme } from "@/lib/theme";
import type { StatusState } from "@/server/status/status";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import type { FrameContent } from "./frame-content";
import { MarketSwitcher, type SwitcherMarket } from "./market-switcher";
import { MenuFeature, type FeatureContext } from "./menu-features";
import { NewsletterForm } from "./newsletter-form";
import { MegaMenus, PhoneMenu } from "./site-nav";
import { StatusDot } from "./status-dot";

export interface FrameStatus {
  state: StatusState;
  label: string;
  href: string;
}

const getStarted = "inline-flex items-center rounded-sm bg-brand text-on-brand hover:bg-brand-hover";

/**
 * The public site's frame, as designed (docs/design/home-desktop.html):
 * the top strip, the header with its menus, and the footer. `path` is the
 * page after the market ("", "/pricing"), so the switcher keeps you on it.
 */
export function SiteFrame({
  market,
  markets,
  path,
  signedIn,
  theme,
  status,
  content,
  features,
  children,
}: {
  market: SwitcherMarket;
  markets: SwitcherMarket[];
  path: string;
  signedIn: boolean;
  theme: Theme;
  status: FrameStatus;
  /** The header's menus and the footer's links, from the website editor. */
  content: FrameContent;
  features: FeatureContext;
  children: React.ReactNode;
}) {
  const base = `/${market.code}`;
  const left = content.menus.filter((m) => !m.right);
  const right = content.menus.filter((m) => m.right);
  const drawn = Object.fromEntries(content.menus.map((m) => [m.id, <MenuFeature key={m.id} feature={m.feature} ctx={features} />]));
  const account = signedIn ? { label: "Open console", href: "/app" } : { label: "Sign in", href: "/sign-in" };
  const start = signedIn ? { label: "Open console", href: "/app" } : { label: "Get started", href: "/sign-up" };

  return (
    <div className="flex min-h-dvh flex-col bg-surface-1 text-ink-body">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-1 focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>

      {/* Top strip: live status, country and currency, sign in. Phones have these in the menu and footer. */}
      <div className="hidden bg-surface-0 text-site-strip text-ink-muted md:block">
        <div className="page-container flex h-8.5 items-center justify-between">
          <a href={status.href} className="flex items-center gap-2 hover:text-ink">
            <StatusDot state={status.state} />
            {status.label}
          </a>
          <div className="flex items-center gap-6">
            <MarketSwitcher markets={markets} current={market} path={path} variant="strip" />
            <Link href={account.href} className="hover:text-ink">
              {account.label}
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-border bg-surface-1">
        <div className="page-container flex h-16 items-center justify-between gap-4 lg:h-19">
          <div className="flex items-center gap-14">
            <Link href={base} className="flex shrink-0 items-center rounded-sm" aria-label={`${company.name} home`}>
              <Logo height={38} className="lg:hidden" />
              <Logo height={46} className="hidden lg:inline-flex" />
            </Link>
            <nav aria-label="Site" className="hidden items-center gap-6.5 xl:flex">
              <MegaMenus menus={left} features={drawn} />
              {content.links.map((l) => (
                <Link key={l.href} href={l.href} aria-current={l.href === `${base}${path}` ? "page" : undefined} className="text-site-nav text-ink hover:text-link aria-[current=page]:text-link">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2.5 xl:gap-5.5">
            {right.length ? <MegaMenus menus={right} features={drawn} className="hidden xl:flex" /> : null}
            <Link href={start.href} className={`${getStarted} h-9.5 px-3.5 text-caption xl:h-9 xl:px-4 xl:text-site-nav xl:font-normal`}>
              {start.label}
            </Link>
            <div className="xl:hidden">
              <PhoneMenu
                menus={content.menus}
                links={[...content.links, { label: "Service status", href: status.href }]}
                footer={
                  <>
                    <MarketSwitcher markets={markets} current={market} path={path} align="start" up />
                    <Link href={account.href} className="flex min-h-11 items-center justify-center rounded-sm border border-border text-body font-semibold text-ink">
                      {account.label}
                    </Link>
                  </>
                }
              />
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="bg-footer text-ink-on-dark">
        <div className="page-container">
          {content.newsletter ? (
            <div className="grid items-center gap-6 border-b border-footer-line py-11 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:py-14">
              <div className="flex flex-col gap-2">
                <h2 className="text-title-2 text-on-navy lg:text-title-1 lg:font-semibold">{content.newsletter.heading}</h2>
                {content.newsletter.text ? <p className="text-callout text-footer-muted lg:text-body">{content.newsletter.text}</p> : null}
              </div>
              <NewsletterForm market={market.code} privacyHref={`${base}/legal/privacy`} />
            </div>
          ) : null}

          <div className="grid py-11 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] lg:gap-12 lg:pt-14 lg:pb-12">
            <div className="mb-10 flex flex-col gap-4.5 text-callout lg:mb-0">
              <Link href={base} aria-label={`${company.name} home`} className="w-fit rounded-sm">
                <img src="/brand/logo/fgt-logo-reverse.svg" alt="" width={176} height={46} className="h-10 w-auto lg:h-11.5" />
              </Link>
              {content.tagline ? <p className="whitespace-pre-line text-footer-muted">{content.tagline}</p> : null}
              <div className="flex flex-col gap-1.5">
                {content.contact.address ? <address className="whitespace-pre-line not-italic">{content.contact.address}</address> : null}
                {content.contact.phone ? (
                  <a href={`tel:${content.contact.phone.replace(/\s/g, "")}`} className="w-fit hover:text-on-navy hover:underline">
                    {content.contact.phone}
                  </a>
                ) : null}
                <a href={`mailto:${content.contact.email}`} className="w-fit break-all hover:text-on-navy hover:underline">
                  {content.contact.email}
                </a>
              </div>
              {content.social.length ? (
                <ul aria-label="Follow us" className="flex flex-wrap gap-2">
                  {content.social.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="inline-flex h-9 items-center rounded-sm border border-footer-field-line px-3 text-caption hover:text-on-navy"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {content.columns.map((c, i) => {
              const links = (
                <ul className="flex flex-col gap-3 text-callout">
                  {c.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href} className="text-footer-link hover:text-on-navy hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              );
              return (
                <nav key={i} aria-labelledby={`footer-${i + 1}`}>
                  {/* Wide screens: open columns. Phones: one row each that opens, as designed. */}
                  <div className="hidden flex-col gap-3 lg:flex">
                    <h2 id={`footer-${i + 1}`} className="text-callout font-semibold text-on-navy">
                      {c.heading}
                    </h2>
                    {links}
                  </div>
                  <details className="group border-t border-footer-line lg:hidden [nav:last-child>&]:border-b">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-semibold text-on-navy [&::-webkit-details-marker]:hidden">
                      {c.heading}
                      <span aria-hidden>
                        <span className="group-open:hidden">+</span>
                        <span className="hidden group-open:inline">−</span>
                      </span>
                    </summary>
                    <div className="pb-4">{links}</div>
                  </details>
                </nav>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-footer-line py-5.5 text-caption text-footer-muted lg:flex-row lg:items-center lg:justify-between lg:text-callout">
            <p>
              © {new Date().getFullYear()} {company.legalName} · Registration {company.registrationNumber}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href={`${base}/legal/privacy`} className="hover:text-on-navy">
                Privacy
              </Link>
              <Link href={`${base}/legal/terms`} className="hover:text-on-navy">
                Terms
              </Link>
              <Link href={`${base}/legal/refunds`} className="hover:text-on-navy">
                Refunds
              </Link>
              <a href={status.href} className="inline-flex items-center gap-1.5 hover:text-on-navy">
                <StatusDot state={status.state} className={status.state === "normal" ? "bg-footer-ok" : undefined} />
                {status.label}
              </a>
              <MarketSwitcher markets={markets} current={market} path={path} variant="strip" tone="navy" />
              <ThemeSwitch current={theme} tone="navy" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
