/* eslint-disable @next/next/no-img-element -- the brand SVG lockups are fixed-size files. */
import { Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { company } from "@/config/app";
import type { Theme } from "@/lib/theme";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import type { FrameContent } from "./frame-content";
import { MarketSwitcher, type SwitcherMarket } from "./market-switcher";
import { ServicesMenu, SiteMenu } from "./site-nav";

export interface FrameMarket extends SwitcherMarket {
  paymentMethods: string[];
}

/** The header's pages for the phone menu, less any a service family above them already links to. */
const phonePages = (content: FrameContent) => {
  const inGroups = new Set(content.groups.flatMap((g) => g.links.map((l) => l.href)));
  return content.pages.filter((p) => !inGroups.has(p.href));
};

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
  theme,
  statusUrl,
  content,
  children,
}: {
  market: FrameMarket;
  markets: SwitcherMarket[];
  path: string;
  signedIn: boolean;
  theme: Theme;
  /** The service status page, when one is set up (STATUS_PAGE_URL). */
  statusUrl?: string;
  /** The header's menu and the footer's links, from the website editor. */
  content: FrameContent;
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
        <div className="page-container flex h-16 items-center gap-2 lg:h-20 lg:gap-6">
          <Link href={base} className="flex shrink-0 items-center rounded-sm" aria-label={`${company.name} home`}>
            {/* The full lockup at every width: 42 px tall is its 160 px minimum width (brand/BRAND.md). */}
            <Logo height={42} className="lg:hidden" />
            <Logo height={48} className="hidden lg:inline-flex" />
          </Link>
          <nav aria-label="Site" className="hidden flex-1 items-center gap-1 lg:flex">
            {content.groups.length ? <ServicesMenu groups={content.groups} note={content.menuNote} more={content.menuLink} /> : null}
            {content.pages.map((p) => (
              <Link key={p.href} href={p.href} aria-current={p.href === `${base}${path}` ? "page" : undefined} className="rounded-md px-3 py-2 text-callout font-medium text-ink hover:bg-surface-2 aria-[current=page]:text-link">
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block">
              <MarketSwitcher markets={markets} current={market} path={path} />
            </div>
            {signedIn ? (
              <Button asChild size="md">
                <Link href="/app">Open console</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="md" className="hidden lg:inline-flex">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="md" className="hidden sm:inline-flex">
                  <Link href="/sign-up">Get started</Link>
                </Button>
              </>
            )}
            <div className="lg:hidden">
              <SiteMenu
                groups={content.groups}
                pages={[...phonePages(content), ...(signedIn ? [] : [{ label: "Sign in", href: "/sign-in" }])]}
                footer={
                  <>
                    <MarketSwitcher markets={markets} current={market} path={path} align="start" up />
                    {signedIn ? null : (
                      <Button asChild size="lg" className="w-full">
                        <Link href="/sign-up">Get started</Link>
                      </Button>
                    )}
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

      <footer className="bg-navy text-ink-on-dark">
        <div className="page-container grid gap-10 py-12 md:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href={base} aria-label={`${company.name} home`} className="w-fit rounded-sm">
              <img src="/brand/logo/fgt-logo-reverse.svg" alt="" width={184} height={48} />
            </Link>
            {content.tagline ? <p className="text-callout">{content.tagline}</p> : null}
            <MarketSwitcher markets={markets} current={market} path={path} align="start" tone="navy" />
          </div>
          {content.columns.map((c, i) => (
            <nav key={i} aria-labelledby={`footer-${i + 1}`} className="flex flex-col gap-3">
              <h2 id={`footer-${i + 1}`} className="text-callout font-semibold text-on-navy">
                {c.heading}
              </h2>
              {c.links.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="text-callout hover:text-on-navy hover:underline">
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}
          <div className="flex flex-col gap-3">
            <h2 className="text-callout font-semibold text-on-navy">{content.contactHeading}</h2>
            <a href={`mailto:${content.contact.email}`} className="text-callout break-all hover:text-on-navy hover:underline">
              {content.contact.email}
            </a>
            {content.contact.phone ? (
              <a href={`tel:${content.contact.phone.replace(/\s/g, "")}`} className="text-callout hover:text-on-navy hover:underline">
                {content.contact.phone}
              </a>
            ) : null}
            {content.contact.hours ? <p className="text-callout">{content.contact.hours}</p> : null}
            {content.contact.address ? <address className="text-callout whitespace-pre-line not-italic">{content.contact.address}</address> : null}
            {statusUrl ? (
              <a href={statusUrl} className="inline-flex items-center gap-2 text-callout hover:text-on-navy hover:underline">
                <Activity aria-hidden className="size-4" />
                Service status
              </a>
            ) : null}
            {pay.length ? <p className="text-callout">Pay by {pay.join(" or ")}.</p> : null}
            {content.social.length ? (
              <ul aria-label="Follow us" className="flex flex-wrap gap-x-4 gap-y-2">
                {content.social.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} rel="noopener noreferrer" target="_blank" className="text-callout font-medium text-on-navy hover:underline">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="border-t border-on-navy/10">
          <div className="page-container flex flex-wrap items-center justify-between gap-4 py-6">
            <p className="text-caption">
              © {new Date().getFullYear()} {company.legalName}
            </p>
            <ThemeSwitch current={theme} tone="navy" />
          </div>
        </div>
      </footer>
    </div>
  );
}
