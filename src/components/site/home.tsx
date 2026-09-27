import { Boxes, Building2, Check, CreditCard, GraduationCap, Handshake, HardDrive, LayoutGrid, LifeBuoy, Lock, Mail, Search, Server, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AUDIENCES, BUILDERS, CLOSING, CONSOLE, HERO, marketCopy, PLATE, withDataCentre } from "@/config/site";
import { formatMoney, money } from "@/lib/domain/money";
import type { ServiceFrom } from "@/server/site/site";
import { currentTheme } from "@/server/theme";

const PLATE_ICONS = [Users, CreditCard, LifeBuoy, ShieldCheck];
const SERVICE_ICONS: Record<string, typeof Users> = { productivity: Mail, servers: Server, security: Lock, protection: HardDrive, web: LayoutGrid, apps: Boxes };
const CONSOLE_ICONS = [Sparkles, Users, CreditCard, LifeBuoy];
const AUDIENCE_ICONS = [GraduationCap, Building2, TrendingUp, Handshake];

export interface HomeMarket {
  code: string;
  name: string;
  locale: string;
  supportEmail: string;
  ownDataCentre: boolean;
  highlightedTlds: string[];
  currency: string;
}

const HERO_ALT = "The Cloud Console home page, showing this month's total, the next invoice and services that need attention";
// Wide screens: the whole Home page, seven twelfths of the content width, from a 2x capture so text stays sharp.
const WIDE_SIZES = "(min-width: 1024px) 656px, 100vw";
// Phones and tablets: a close-up of the page's top, so its numbers are readable at phone width.
const CROP_SIZES = "(min-width: 640px) 576px, calc(100vw - 32px)";
const wideSet = (scheme: "light" | "dark") => [960, 1280, 1920, 2560].map((w) => `/site/console-home-${scheme}-${w}.webp ${w}w`).join(", ");
const cropSet = (scheme: "light" | "dark") => [640, 960, 1280].map((w) => `/site/console-home-${scheme}-crop-${w}.webp ${w}w`).join(", ");
const NARROW = "(max-width: 1023px)";

/**
 * The console screenshot in the visitor's theme. Only one picture is
 * fetched: the close-up on phones and tablets, the whole page on wide
 * screens, in the chosen theme (for "match device", the browser picks by
 * prefers-color-scheme).
 */
async function HeroShot() {
  const theme = await currentTheme();
  const schemes = theme === "system" ? (["dark", "light"] as const) : ([theme] as const);
  const fallback = theme === "dark" ? "dark" : "light";
  const when = (scheme: "light" | "dark", media: string) => (theme === "system" && scheme === "dark" ? `${media} and (prefers-color-scheme: dark)` : media);
  return (
    <picture>
      {schemes.map((scheme) => (
        <source key={`crop-${scheme}`} media={when(scheme, NARROW)} srcSet={cropSet(scheme)} sizes={CROP_SIZES} width={1280} height={960} />
      ))}
      {theme === "system" ? <source media="(prefers-color-scheme: dark)" srcSet={wideSet("dark")} sizes={WIDE_SIZES} width={2560} height={1600} /> : null}
      <img
        src={`/site/console-home-${fallback}-1280.webp`}
        srcSet={wideSet(fallback)}
        sizes={WIDE_SIZES}
        alt={HERO_ALT}
        width={2560}
        height={1600}
        fetchPriority="high"
        className="block h-auto w-full"
      />
    </picture>
  );
}

/** "Find your domain": a name and the market's popular endings, into the console's domain search. */
function DomainSearch({ tlds }: { tlds: string[] }) {
  return (
    <form action="/find-domain" method="get" role="search" aria-labelledby="domain-title" className="flex flex-col gap-5 rounded-lg bg-navy p-6 text-on-navy shadow-elevation-3 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="domain-title" className="text-title-1">
          Find your domain
        </h2>
        <p className="text-callout text-ink-on-dark">Search for a name. Renewals go on your monthly invoice.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="domain-q" className="sr-only">
          Domain name
        </label>
        <input
          id="domain-q"
          name="q"
          placeholder={`yourcompany${tlds[0] ?? ".com"}`}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="h-14 flex-1 rounded-md border border-transparent bg-surface-1 px-5 text-headline font-normal text-ink placeholder:text-ink-muted"
        />
        <Button type="submit" size="lg" className="h-14 px-8">
          <Search aria-hidden /> Search
        </Button>
      </div>
      {tlds.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-callout text-ink-on-dark">Popular:</span>
          {tlds.map((tld) => (
            <button key={tld} type="submit" name="tld" value={tld} className="h-10 rounded-full border border-on-navy/20 px-4 text-callout font-semibold text-on-navy hover:bg-on-navy/10">
              {tld}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

/** A lower-page screenshot in the visitor's theme, loaded lazily. */
async function ThemedShot({ name, alt, width, height }: { name: string; alt: string; width: number; height: number }) {
  const theme = await currentTheme();
  const set = (scheme: "light" | "dark") => [640, 960, 1280].map((w) => `/site/${name}-${scheme}-${w}.webp ${w}w`).join(", ");
  const sizes = "(min-width: 1024px) 560px, calc(100vw - 32px)";
  const fallback = theme === "dark" ? "dark" : "light";
  return (
    <picture>
      {theme === "system" ? <source media="(prefers-color-scheme: dark)" srcSet={set("dark")} sizes={sizes} width={width} height={height} /> : null}
      <img src={`/site/${name}-${fallback}-960.webp`} srcSet={set(fallback)} sizes={sizes} alt={alt} width={width} height={height} loading="lazy" decoding="async" className="block h-auto w-full" />
    </picture>
  );
}

/**
 * A drawing of Thebe's approvals list, made for this page (we have no
 * screenshot of Thebe with demo data yet). Amounts are in the market's
 * currency.
 */
function ThebeIllustration({ currency, locale }: { currency: string; locale: string }) {
  const rows: { what: string; who: string; amount: bigint; signed: number; tone: "positive" | "warning" }[] = [
    { what: "Supplier payment", who: "Kgale Hill Logistics", amount: 1_840_000n, signed: 2, tone: "positive" },
    { what: "Office rent, October", who: "Kgale Hill Properties", amount: 4_200_000n, signed: 1, tone: "warning" },
    { what: "Fuel cards", who: "Kgale Hill Logistics", amount: 650_000n, signed: 0, tone: "warning" },
  ];
  return (
    <div aria-hidden className="flex flex-col gap-3 bg-surface-0 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-headline text-ink">Payments to approve</span>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-caption font-semibold text-link">2 waiting</span>
      </div>
      {rows.map((r) => (
        <div key={r.what} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-1 p-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-callout font-semibold text-ink">{r.what}</span>
            <span className="truncate text-caption text-ink-muted">{r.who}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-callout font-semibold text-ink tabular-nums">{formatMoney(money(r.amount, currency), locale)}</span>
            <span className={r.tone === "positive" ? "text-caption font-semibold text-positive" : "text-caption font-semibold text-warning"}>
              {r.signed === 2 ? "Approved, 2 of 2" : `Signed ${r.signed} of 2`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ id, kicker, title, children }: { id: string; kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {kicker ? <p className="label-kicker text-link">{kicker}</p> : null}
      <h2 id={id} className="text-title-1 text-ink sm:text-display">
        {title}
      </h2>
      {children ? <p className="text-body text-ink-muted">{children}</p> : null}
    </div>
  );
}

/** The home page's eight sections, from Change Request 01 section 4. The footer is the site frame's. */
export function HomeContent({ market, services, taxNote }: { market: HomeMarket; services: ServiceFrom[]; taxNote: string | null }) {
  const base = `/${market.code}`;
  const copy = marketCopy(market.code);
  const talk = `mailto:${market.supportEmail}?subject=${encodeURIComponent("Talk to us")}`;
  return (
    <>
      {/* 1. Hero */}
      <section aria-labelledby="hero-title" className="overflow-hidden border-b border-border bg-surface-1">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 pt-12 pb-10 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:pt-20 lg:pb-14">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
            <p className="label-kicker text-link">{HERO.kicker}</p>
            <h1 id="hero-title" className="text-display text-ink sm:text-hero">
              {HERO.headline}
            </h1>
            <p className="max-w-xl text-body text-ink-body sm:text-headline sm:font-normal">{HERO.sub}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={`${base}/pricing`}>View plans</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href={talk}>Talk to us</a>
              </Button>
            </div>
            <ul className="flex flex-col gap-2 text-callout text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-5">
              {HERO.supporting.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <Check aria-hidden className="size-4 text-positive" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <figure className="relative mx-auto w-full max-w-xl min-w-0 lg:col-span-7 lg:max-w-none">
            <div className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-elevation-3">
              <HeroShot />
            </div>
            <figcaption className="mt-3 text-caption text-ink-muted">The Cloud Console, with demo data.</figcaption>
          </figure>
        </div>
        <div className="mx-auto max-w-content px-4 pb-12 sm:px-6 lg:pb-20">
          <DomainSearch tlds={market.highlightedTlds} />
        </div>
      </section>

      {/* 2. What we take off your plate */}
      <section aria-labelledby="plate-title" className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeading id="plate-title" kicker="What we take off your plate" title={PLATE.heading} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATE.cards.map(([title, body], i) => {
            const Icon = PLATE_ICONS[i];
            return (
              <li key={title} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6 shadow-elevation-1">
                <span className="flex size-10 items-center justify-center rounded-md bg-brand-soft text-link">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="text-headline text-ink">{title}</h3>
                <p className="text-callout text-ink-muted">{body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 3. Services */}
      <section id="services" aria-labelledby="services-title" className="scroll-mt-20 border-y border-border bg-surface-1">
        <div className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:py-24">
          <SectionHeading id="services-title" kicker="Services" title="Everything you run, managed by one team.">
            Prices are per month, in your currency, on one invoice.{taxNote ? ` ${taxNote}` : ""}
          </SectionHeading>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(({ card, from, unitLabel }) => {
              const Icon = SERVICE_ICONS[card.key] ?? Boxes;
              return (
                <li key={card.key} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-0 p-6">
                  <Icon aria-hidden className="size-6 text-link" />
                  <h3 className="text-headline text-ink">{card.title}</h3>
                  <div className="flex flex-1 flex-col gap-2 text-callout text-ink-muted">
                    <p>{card.key === "servers" ? withDataCentre(card.body, market) : card.body}</p>
                    {card.key === "protection" && copy.localHosting ? <p>{copy.localHosting}</p> : null}
                  </div>
                  <p className="text-callout text-ink">
                    {from ? (
                      <>
                        From <span className="font-semibold tabular-nums">{formatMoney(from, market.locale)}</span> {unitLabel} a month
                      </>
                    ) : (
                      "Priced for you. Talk to us."
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-8">
            <Link href={`${base}/pricing`} className="text-callout font-semibold text-link hover:underline">
              See every price
            </Link>
          </p>
        </div>
      </section>

      {/* 4. The Cloud Console */}
      <section aria-labelledby="console-title" className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-10">
            <SectionHeading id="console-title" kicker="The Cloud Console" title={CONSOLE.heading} />
            <ul className="flex flex-col gap-6">
              {CONSOLE.points.map(([title, body], i) => {
                const Icon = CONSOLE_ICONS[i];
                return (
                  <li key={title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-link">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-headline text-ink">{title}</h3>
                      <p className="text-callout text-ink-muted">{body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <figure className="min-w-0">
            <div className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-elevation-3">
              <ThemedShot name="console-invoice" width={1280} height={950} alt="A monthly invoice in the Cloud Console, with each line explained and what changed since last month" />
            </div>
            <figcaption className="mt-3 text-caption text-ink-muted">A monthly invoice in the Cloud Console, with demo data.</figcaption>
          </figure>
        </div>
      </section>

      {/* 5. Built by people who build software */}
      <section aria-labelledby="builders-title" className="bg-navy text-ink-on-dark">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col gap-4">
            <h2 id="builders-title" className="max-w-2xl text-title-1 text-on-navy sm:text-display">
              {BUILDERS.heading}
            </h2>
            <p className="max-w-2xl text-body">{BUILDERS.body}</p>
          </div>
          <article aria-labelledby="thebe-title" className="overflow-hidden rounded-lg border border-on-navy/10 bg-surface-1 text-ink shadow-elevation-3">
            <figure className="border-b border-border">
              <ThebeIllustration currency={market.currency} locale={market.locale} />
              <figcaption className="sr-only">An illustration of Thebe&apos;s list of payments waiting for approval.</figcaption>
            </figure>
            <div className="flex flex-col gap-2 p-6">
              <p className="label-kicker text-link">Our software</p>
              <h3 id="thebe-title" className="text-title-2 text-ink">
                {BUILDERS.thebe.name}
              </h3>
              <p className="text-callout text-ink-muted">{BUILDERS.thebe.body}</p>
              <Link href={`${base}/pricing#cat-our-software`} className="mt-2 w-fit text-callout font-semibold text-link hover:underline">
                See Thebe&apos;s price
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* 6. Who we serve */}
      <section aria-labelledby="audiences-title" className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeading id="audiences-title" title={AUDIENCES.heading} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.items.map(([title, body], i) => {
            const Icon = AUDIENCE_ICONS[i];
            return (
              <li key={title} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6">
                <Icon aria-hidden className="size-6 text-link" />
                <h3 className="text-headline text-ink">{title}</h3>
                <p className="text-callout text-ink-muted">{body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {copy.testimonials.length ? (
        <section aria-labelledby="quotes-title" className="mx-auto max-w-content px-4 pb-16 sm:px-6">
          <h2 id="quotes-title" className="sr-only">
            What customers say
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {copy.testimonials.map((t) => (
              <li key={t.name} className="rounded-lg border border-border bg-surface-1 p-6">
                <blockquote className="text-body text-ink">{t.quote}</blockquote>
                <p className="mt-3 text-callout text-ink-muted">
                  {t.name}, {t.role}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 7. Closing */}
      <section aria-labelledby="closing-title" className="border-t border-border bg-surface-1">
        <div className="mx-auto flex max-w-content flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:py-20">
          <h2 id="closing-title" className="max-w-3xl text-title-1 text-ink sm:text-display">
            {CLOSING.heading}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href={`mailto:${market.supportEmail}?subject=${encodeURIComponent("Book a call")}`}>Book a call</a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
