/* eslint-disable @next/next/no-img-element -- the hero screenshots are pre-sized WebP files with fixed dimensions. */
import { Boxes, Building2, Check, CreditCard, GraduationCap, Handshake, HardDrive, LayoutGrid, LifeBuoy, Lock, Mail, Server, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AUDIENCES, BUILDERS, CLOSING, CONSOLE, HERO, marketCopy, PLATE, withDataCentre } from "@/config/site";
import { formatMoney } from "@/lib/domain/money";
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
}

const HERO_ALT = "The Cloud Console home page, showing this month's total, the next invoice and services that need attention";
// The hero is half the content width on wide screens and the full width, less the gutter, on phones.
const HERO_SIZES = "(min-width: 1024px) 512px, calc(100vw - 32px)";
const heroSet = (scheme: "light" | "dark") =>
  `/site/console-home-${scheme}-640.webp 640w, /site/console-home-${scheme}-960.webp 960w, /site/console-home-${scheme}.webp 1280w`;

/**
 * The console screenshot in the visitor's theme. Only one picture is
 * fetched: the chosen theme's, or for "match device" the browser picks by
 * prefers-color-scheme. Phones get a smaller file.
 */
async function HeroShot() {
  const theme = await currentTheme();
  const img = (scheme: "light" | "dark") => (
    <img src={`/site/console-home-${scheme}.webp`} srcSet={heroSet(scheme)} sizes={HERO_SIZES} alt={HERO_ALT} width={1280} height={800} fetchPriority="high" className="block h-auto w-full" />
  );
  if (theme !== "system") return img(theme);
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={heroSet("dark")} sizes={HERO_SIZES} />
      {img("light")}
    </picture>
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
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:py-20">
          <div className="flex flex-col gap-6">
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
          <figure className="relative">
            <div className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-elevation-3">
              <HeroShot />
            </div>
            <figcaption className="mt-3 text-caption text-ink-muted">The Cloud Console, with demo data.</figcaption>
          </figure>
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
        <SectionHeading id="console-title" kicker="The Cloud Console" title={CONSOLE.heading} />
        <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
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
      </section>

      {/* 5. Built by people who build software */}
      <section aria-labelledby="builders-title" className="bg-navy text-ink-on-dark">
        <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-16 sm:px-6 lg:py-20">
          <h2 id="builders-title" className="max-w-2xl text-title-1 text-on-navy sm:text-display">
            {BUILDERS.heading}
          </h2>
          <p className="max-w-2xl text-body">{BUILDERS.body}</p>
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
