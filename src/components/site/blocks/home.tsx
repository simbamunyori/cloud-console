/* eslint-disable @next/next/no-img-element -- fixed-size brand SVGs. */
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type {
  ClosingBannerBlock,
  CompareTableBlock,
  DomainStoreBlock,
  EmailShowcaseBlock,
  HomeHeroBlock,
  NumberedServicesBlock,
  PlansTableBlock,
  ProofStripBlock,
  SecurityPanelBlock,
  TeamSectionBlock,
  ThebeSectionBlock,
  WebsitesShowcaseBlock,
} from "@/cms/payload-types";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { selection } from "@/server/cms/catalogue-options";
import { env } from "@/server/env";
import { readCart } from "@/server/site/cart";
import { selected, siteMarket, sitePrices, taxNote, type SitePrice } from "@/server/site/site";
import { ConsoleHomeDemo, ConsoleSecurityDemo } from "../console-demo";
import { DomainStore } from "../domain-store";
import { PlanEstimate } from "../plan-estimate";
import { ClientGrid, EmailPartnerBadge, PartnerGrid, ProofNumbers, ShowcaseCard } from "../proof";
import { emailPartner, firstReplyMinutes, approvedPartners, permittedClientLogos, permittedShowcaseSites, visibleProofNumbers, visibleTeam } from "@/server/site/proof";
import { formatReplyTime } from "@/server/support/first-reply";
import { KgaleSignature, MothibiSite, ThebeScreen } from "../showcase";
import { linkHref, MediaImage, type BlockContext, type CmsLinkValue } from "./parts";

/**
 * The home page's sections, drawn exactly as designed
 * (docs/design/home-desktop.html and home-phone.html): wide screens from
 * lg up, phones below. Words come from the website editor, with shorter
 * phone words where the design shortens them.
 */

type Tone = "plain" | "panel" | "navy";

/** A home section: 120 px of air on wide screens, 64 px on phones, a 1 px rule between plain sections. */
function HomeSection({ id, labelledBy, tone = "plain", className, children }: { id?: string | null; labelledBy: string; tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <section
      id={id ?? undefined}
      aria-labelledby={labelledBy}
      className={cn("defer-render scroll-mt-20", tone === "navy" ? "bg-navy text-ink-on-dark" : "border-t border-border", tone === "panel" && "bg-surface-0")}
    >
      <div className={cn("page-container flex flex-col gap-6 py-16 lg:gap-14 lg:py-30", className)}>{children}</div>
    </section>
  );
}

/** Main words on wide screens, the phone's shorter words below lg. */
function Words({ main, phone }: { main: string; phone?: string | null }) {
  if (!phone) return <>{main}</>;
  return (
    <>
      <span className="hidden lg:inline">{main}</span>
      <span className="lg:hidden">{phone}</span>
    </>
  );
}

function Kicker({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <p className={cn("text-caption font-semibold tracking-widest uppercase lg:text-site-kicker", dark ? "text-navy-kicker" : "text-link")}>{children}</p>;
}

function Title({ id, b, dark, className }: { id: string; b: { kicker?: string | null; heading: string; headingPhone?: string | null; intro?: string | null; introPhone?: string | null }; dark?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {b.kicker ? <Kicker dark={dark}>{b.kicker}</Kicker> : null}
      <h2 id={id} className={cn("max-w-205 text-site-h2-sm lg:text-site-h2", dark ? "text-on-navy" : "text-ink")}>
        <Words main={b.heading} phone={b.headingPhone} />
      </h2>
      {b.intro ? (
        <p className={cn("max-w-170 text-body lg:text-site-lead", dark ? "text-ink-on-dark" : "text-ink-muted", !b.introPhone && "hidden lg:block")}>
          <Words main={b.intro} phone={b.introPhone} />
        </p>
      ) : null}
    </div>
  );
}

const button = "inline-flex h-13 items-center justify-center rounded-sm bg-brand px-6.5 text-body font-semibold text-on-brand hover:bg-brand-hover";

/** A link from the editor, or nothing while it has nowhere to go. */
function EditorLink({ link, market, className, arrow = false, children }: { link: CmsLinkValue | null | undefined; market: BlockContext["market"]; className?: string; arrow?: boolean; children?: React.ReactNode }) {
  const href = linkHref(link, market);
  if (!href) return null;
  const inner = (
    <>
      {children ?? link!.label}
      {arrow ? <ArrowRight aria-hidden className="size-4 shrink-0" /> : null}
    </>
  );
  return href.startsWith("mailto:") || /^https?:/.test(href) ? (
    <a href={href} className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

const textLink = "inline-flex items-center gap-1 font-semibold text-link hover:underline";

export async function HomeHero({ block: b, ctx }: { block: HomeHeroBlock; ctx: BlockContext }) {
  const m = await siteMarket(ctx.market.code);
  return (
    <section aria-labelledby={`${ctx.id}-title`} className="page-container flex flex-col gap-5 pt-12 lg:items-center lg:gap-7 lg:pt-24 lg:text-center">
      {b.kicker ? <Kicker>{b.kicker}</Kicker> : null}
      <h1 id={`${ctx.id}-title`} className="max-w-260 text-site-hero-sm text-ink lg:text-site-hero">
        {b.heading}
      </h1>
      {b.sub ? (
        <p className="max-w-170 text-body text-ink-muted lg:text-site-lead">
          <Words main={b.sub} phone={b.subPhone} />
        </p>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-4.5">
        <EditorLink link={b.primary} market={ctx.market} className={button} />
        <EditorLink link={b.secondary} market={ctx.market} arrow className="inline-flex h-13 items-center justify-center gap-1 px-1.5 text-body font-semibold text-ink hover:text-link" />
      </div>
      {b.showConsole ? (
        <div className="mt-3 w-full max-w-290 lg:mt-10">
          <ConsoleHomeDemo
            market={{ locale: m.locale, currency: m.currency, today: todayIn(m.timeZone) }}
            description="The Cloud Console home page for a demo customer, Kgale Logistics: this month's total, the next invoice, the security score, their services and what needs attention."
          />
        </div>
      ) : null}
    </section>
  );
}

export async function DomainStoreSection({ block: b, ctx }: { block: DomainStoreBlock; ctx: BlockContext }) {
  return (
    <div className="mt-16 lg:mt-30">
      <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`} tone="panel">
        <Title id={`${ctx.id}-title`} b={b} />
        <DomainStore market={ctx.market.code} example={b.example || "yourcompany"} initialQuery={ctx.domain ?? ""} initialCart={await readCart()} />
      </HomeSection>
    </div>
  );
}

/** Numbers, partner badges and client logos under the domain search. Each part hides while it has nothing approved; the section hides when all do. */
export async function ProofStripSection({ block: b, ctx }: { block: ProofStripBlock; ctx: BlockContext }) {
  const code = ctx.market.code;
  const [numbers, partners, clients] = await Promise.all([b.numbers === false ? [] : visibleProofNumbers(code), approvedPartners(code), permittedClientLogos(code)]);
  if (!numbers.length && !partners.length && !clients.length) return null;
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`} className="lg:gap-12">
      <h2 id={`${ctx.id}-title`} className="sr-only">
        Why businesses choose us
      </h2>
      {numbers.length ? <ProofNumbers numbers={numbers} /> : null}
      {partners.length || clients.length ? (
        <div className="flex flex-col gap-4.5 lg:gap-8">
          {partners.length ? <PartnerGrid partners={partners} heading={b.partnersHeading || "Partners and accreditations"} /> : null}
          {clients.length ? <ClientGrid clients={clients} heading={b.clientsHeading || "Businesses we look after"} className="hidden lg:flex" /> : null}
        </div>
      ) : null}
    </HomeSection>
  );
}

export function NumberedServices({ block: b, ctx }: { block: NumberedServicesBlock; ctx: BlockContext }) {
  const items = b.items ?? [];
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`}>
      <Title id={`${ctx.id}-title`} b={b} />
      <ol className="grid border-t border-navy lg:grid-cols-6">
        {items.map((it, i) => {
          const href = linkHref(it.link, ctx.market);
          return (
            <li key={it.id ?? it.title} className="flex flex-col gap-1.5 border-b border-border py-4.5 lg:gap-3 lg:border-b-0 lg:pt-7 lg:pr-6">
              <span aria-hidden className="hidden text-callout font-semibold text-link lg:block">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="flex items-center justify-between text-title-2 text-ink">
                {href ? (
                  <Link href={href} className="hover:text-link">
                    {it.title}
                  </Link>
                ) : (
                  it.title
                )}
                {href ? <ArrowRight aria-hidden className="size-4 text-link lg:hidden" /> : null}
              </h3>
              {it.body ? (
                <p className="text-callout text-ink-muted lg:text-body">
                  <Words main={it.body} phone={it.bodyPhone} />
                </p>
              ) : null}
              {href ? (
                <Link href={href} className={cn(textLink, "mt-1 hidden lg:inline-flex")}>
                  {it.link!.label}
                  <span className="sr-only"> about {it.title}</span> <ArrowRight aria-hidden className="size-4" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </HomeSection>
  );
}

const MESSAGE = "Please find this month's invoice attached. Thank you for your business.";

export async function EmailShowcase({ block: b, ctx }: { block: EmailShowcaseBlock; ctx: BlockContext }) {
  const partner = await emailPartner(ctx.market.code);
  const phone = (
    <div className="flex flex-col gap-3 rounded-device border-8 border-device-frame bg-surface-1 px-3.5 py-4.5 text-ink lg:h-105 lg:px-4 lg:py-5">
      <p className="text-caption text-ink-muted">Phone · Outlook</p>
      <p className="text-callout">{MESSAGE}</p>
      <KgaleSignature compact />
      {b.caption ? <p className="mt-auto hidden text-callout font-semibold text-positive lg:block">{b.caption}</p> : null}
    </div>
  );
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`} tone="navy">
      {partner ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <Title id={`${ctx.id}-title`} b={b} dark />
          <EmailPartnerBadge partner={partner} />
        </div>
      ) : (
        <Title id={`${ctx.id}-title`} b={b} dark />
      )}
      <figure className="m-0 grid items-end gap-8 lg:grid-cols-[1fr_var(--layout-phone-mock)]">
        <div inert aria-hidden className="hidden overflow-hidden rounded-lg border border-footer-field-line bg-surface-1 text-ink lg:block">
          <p className="flex h-9 items-center border-b border-border px-4 text-caption text-ink-muted">Laptop · Outlook</p>
          <div className="flex flex-col gap-3.5 p-7 text-body">
            <p className="text-callout text-ink-muted">To: finance@client.co.bw · Subject: October invoice</p>
            <p>{MESSAGE}</p>
            <KgaleSignature />
          </div>
        </div>
        <div inert aria-hidden>
          {phone}
        </div>
        <figcaption className="sr-only">An example: the same branded email signature for Kgale Logistics on a laptop and on a phone.</figcaption>
      </figure>
    </HomeSection>
  );
}

export async function WebsitesShowcase({ block: b, ctx }: { block: WebsitesShowcaseBlock; ctx: BlockContext }) {
  const prices = await sitePrices(ctx.market.code);
  // A card about products shows only while one of them is on sale here.
  const cards = (b.cards ?? []).filter((c) => !hasSelection(c.products) || selected(prices, selection(c.products)).length > 0);
  const sites = await permittedShowcaseSites(ctx.market.code);
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`}>
      <Title id={`${ctx.id}-title`} b={b} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
        <figure className="m-0">
          <div className="hidden lg:block">
            <MothibiSite />
          </div>
          <div className="lg:hidden">
            <MothibiSite compact />
          </div>
          <figcaption className="sr-only">An example website for a law firm, Mothibi Attorneys, in its own brand.</figcaption>
        </figure>
        <div className="flex flex-col gap-6 lg:gap-5">
          {cards.map((c) => (
            <div key={c.id ?? c.title} className="flex flex-col gap-2 rounded-lg border border-border p-5 lg:gap-2.5 lg:p-7">
              <h3 className="text-headline text-ink lg:text-title-2">{c.title}</h3>
              {c.body ? (
                <p className="text-callout text-ink-muted lg:text-body">
                  <Words main={c.body} phone={c.bodyPhone} />
                </p>
              ) : null}
              <EditorLink link={c.link} market={ctx.market} arrow className={cn(textLink, "w-fit")} />
            </div>
          ))}
          {b.industries?.length ? (
            <ul aria-label="Templates for" className="hidden flex-wrap gap-2 lg:flex">
              {b.industries.map((i) => (
                <li key={i.id ?? i.name} className="rounded-full border border-border px-3 py-1.5 text-callout text-ink">
                  {i.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {sites.length ? (
        <div className="flex flex-col gap-4.5">
          <h3 className="text-callout font-medium text-ink-muted">Websites we built</h3>
          <ul className="grid gap-6 lg:grid-cols-3">
            {sites.map((site, i) => (
              // Phones show the first site only, to keep the page short.
              <li key={site.id} className={i > 0 ? "hidden lg:block" : undefined}>
                <ShowcaseCard site={site} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </HomeSection>
  );
}

const hasSelection = (v: unknown) => {
  const s = selection(v);
  return Boolean(s.categories?.length || s.products?.length);
};

export async function SecurityPanel({ block: b, ctx }: { block: SecurityPanelBlock; ctx: BlockContext }) {
  const m = await siteMarket(ctx.market.code);
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`} tone="panel">
      <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-18">
        <Title id={`${ctx.id}-title`} b={b} />
        <ConsoleSecurityDemo market={{ locale: m.locale, currency: m.currency, today: todayIn(m.timeZone) }} />
      </div>
    </HomeSection>
  );
}

export async function ThebeSection({ block: b, ctx }: { block: ThebeSectionBlock; ctx: BlockContext }) {
  const e = env();
  const m = await siteMarket(ctx.market.code);
  const features = (b.features ?? []).filter((f) => !f.accounting || b.showAccounting);
  const tryButton = e.THEBE_TRY_URL ? (
    <a href={e.THEBE_TRY_URL} className="inline-flex h-12.5 items-center justify-center rounded-sm bg-thebe-teal px-6 font-semibold text-thebe-white hover:opacity-90">
      Try Thebe
    </a>
  ) : null;
  const more = e.THEBE_URL ? (
    <a href={e.THEBE_URL} className="inline-flex items-center justify-center gap-1 font-semibold text-thebe-white hover:underline">
      Learn more about Thebe <ArrowRight aria-hidden className="size-4" />
    </a>
  ) : null;
  return (
    <section id={b.anchor ?? undefined} aria-labelledby={`${ctx.id}-title`} className="defer-render scroll-mt-20 bg-thebe-ink font-thebe text-thebe-white">
      <div className="page-container grid items-center gap-5 py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-18 lg:py-30">
        <div className="flex flex-col gap-5 lg:gap-5.5">
          <img src="/brand/thebe/thebe-lockup-white.svg" alt="Thebe" width={154} height={34} className="h-7 w-auto self-start lg:h-8.5" />
          {b.kicker ? (
            <p className="text-caption font-semibold tracking-widest text-thebe-kicker uppercase lg:text-site-kicker">
              <Words main={b.kicker} phone={b.kickerPhone} />
            </p>
          ) : null}
          <h2 id={`${ctx.id}-title`} className="text-site-h2-sm text-thebe-white lg:text-site-h2">
            <Words main={b.heading} phone={b.headingPhone} />
          </h2>
          {b.intro ? (
            <p className="text-body text-thebe-muted lg:text-site-lead">
              <Words main={b.intro} phone={b.introPhone} />
            </p>
          ) : null}
          {features.length ? (
            <ul className="mt-1.5 hidden grid-cols-2 gap-x-7 gap-y-4.5 lg:grid">
              {features.map((f) => (
                <li key={f.id ?? f.title} className="flex flex-col gap-1 border-t border-thebe-line pt-3.5">
                  <span className="text-body font-semibold">{f.title}</span>
                  {f.body ? <span className="text-callout text-thebe-muted">{f.body}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {tryButton || more ? (
            <div className="mt-2 hidden items-center gap-5 lg:flex">
              {tryButton}
              {more}
            </div>
          ) : null}
        </div>
        <figure className="m-0">
          <div className="hidden lg:block">
            <ThebeScreen money={{ locale: m.locale, currency: m.currency }} />
          </div>
          <div className="lg:hidden">
            <ThebeScreen money={{ locale: m.locale, currency: m.currency }} compact />
          </div>
          <figcaption className="sr-only">Thebe for a demo customer, Kgale Logistics: what is left to spend this month and the requests waiting for approval.</figcaption>
        </figure>
        {tryButton || more ? (
          <div className="flex flex-col gap-4 lg:hidden">
            {tryButton}
            {more}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const PLAN_KEYS = ["start", "grow", "protect"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];
const PLAN_NAMES: Record<PlanKey, string> = { start: "Start", grow: "Grow", protect: "Protect" };
const RECOMMENDED: PlanKey = "grow";
const chooseHref = (k: PlanKey) => `/app/marketplace/plan-${k}`;

/** Each plan's price per business and per user, or null while any of the three is not on sale in the market. */
function planPrices(prices: SitePrice[]): Record<PlanKey, { base: SitePrice; perUser: SitePrice }> | null {
  const find = (slug: string) => prices.find((p) => p.slug === slug);
  const out = {} as Record<PlanKey, { base: SitePrice; perUser: SitePrice }>;
  for (const k of PLAN_KEYS) {
    const base = find(`plan-${k}`);
    const perUser = find(`plan-${k}-users`);
    if (!base || !perUser) return null;
    out[k] = { base, perUser };
  }
  return out;
}

export async function PlansTable({ block: b, ctx }: { block: PlansTableBlock; ctx: BlockContext }) {
  const [prices, m] = await Promise.all([sitePrices(ctx.market.code), siteMarket(ctx.market.code)]);
  const plans = planPrices(prices);
  if (!plans) return null;
  const fmt = (p: SitePrice) => formatMoney(p.price, m.locale);
  const rows = b.rows ?? [];
  const footnote = [b.footnote, taxNote(m)].filter(Boolean).join(" ");
  const rec = plans[RECOMMENDED];
  const estimate = { name: PLAN_NAMES[RECOMMENDED], base: rec.base.price.amountMinor.toString(), perUser: rec.perUser.price.amountMinor.toString() };
  const users = b.users ?? 8;
  const tone = (included: boolean | null | undefined) => (included ? "text-positive" : "text-ink-muted");
  const cell = "border-l border-border px-7 py-4 text-left font-normal";
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <Title id={`${ctx.id}-title`} b={b} />
        <div className="hidden lg:block">
          <PlanEstimate plan={estimate} users={users} locale={m.locale} currency={m.currency} variant="wide" chooseHref={chooseHref(RECOMMENDED)} />
        </div>
      </div>

      {/* Wide screens: every row, each plan's prices and its button. */}
      <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
        <table className="w-full table-fixed border-collapse text-body">
          <caption className="sr-only">The three plans compared, with prices a month</caption>
          <colgroup>
            <col className="w-2/7" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead className="bg-navy text-on-navy">
            <tr>
              <th scope="col" className="px-7 py-6 text-left text-callout font-normal text-ink-on-dark">
                Compare plans
              </th>
              {PLAN_KEYS.map((k) => (
                <th key={k} scope="col" className="border-l border-navy-line px-7 py-6 text-left align-top font-normal">
                  <span className="flex flex-wrap items-center gap-2.5 text-title-2">
                    {PLAN_NAMES[k]}
                    {k === RECOMMENDED ? <span className="rounded-lg bg-on-navy px-2 py-0.5 text-caption font-bold tracking-widest text-navy">RECOMMENDED</span> : null}
                  </span>
                  <span className="mt-1.5 block text-callout text-ink-on-dark">
                    {fmt(plans[k].base)} per business + {fmt(plans[k].perUser)} per user a month
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? r.label} className="border-t border-border">
                <th scope="row" className="px-7 py-4 text-left font-normal text-ink">
                  {r.label}
                </th>
                {PLAN_KEYS.map((k) => (
                  <td key={k} className={cn(cell, tone(r[`${k}Included`]), k === RECOMMENDED && "bg-site-highlight")}>
                    {r[k]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-border">
              <td />
              {PLAN_KEYS.map((k) => (
                <td key={k} className={cn("border-l border-border px-7 py-5", k === RECOMMENDED && "bg-site-highlight")}>
                  {k === RECOMMENDED ? (
                    <Link href={chooseHref(k)} className={cn(button, "h-11 w-full")}>
                      Choose {PLAN_NAMES[k]}
                    </Link>
                  ) : (
                    <Link href={chooseHref(k)} className={textLink}>
                      Choose {PLAN_NAMES[k]} <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Phones: the short table, then the recommended plan's estimate pinned while the table scrolls past. */}
      <div className="flex flex-col gap-6 lg:hidden">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed border-collapse text-caption">
            <caption className="sr-only">The three plans compared</caption>
            <colgroup>
              <col className="w-1/3" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead className="bg-navy text-callout font-semibold text-on-navy">
              <tr>
                <td className="px-2.5 py-3" />
                {PLAN_KEYS.map((k) => (
                  <th key={k} scope="col" className={cn("px-1.5 py-3 text-center font-semibold", k === RECOMMENDED && "bg-brand")}>
                    {PLAN_NAMES[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? r.label} className="border-t border-border">
                  <th scope="row" className="px-2.5 py-3 text-left font-normal text-ink">
                    {r.labelPhone || r.label}
                  </th>
                  {PLAN_KEYS.map((k) => (
                    <td key={k} className={cn("px-1.5 py-3 text-center", r[`${k}Included`] ? "font-semibold text-positive" : "text-ink-muted", k === RECOMMENDED && "bg-site-highlight")}>
                      {r[`${k}Phone`] || r[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-1 text-callout text-ink-muted">
          {PLAN_KEYS.map((k) => (
            <li key={k}>
              <strong className="font-semibold text-ink">{PLAN_NAMES[k]}</strong>: {fmt(plans[k].base)} per business + {fmt(plans[k].perUser)} per user a month.{" "}
              {k === RECOMMENDED ? null : (
                <Link href={chooseHref(k)} className="font-semibold text-link hover:underline">
                  Choose {PLAN_NAMES[k]}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <PlanEstimate plan={estimate} users={users} locale={m.locale} currency={m.currency} variant="phone" chooseHref={chooseHref(RECOMMENDED)} />
      </div>

      {footnote ? <p className="-mt-2 text-callout text-ink-muted lg:-mt-6">{footnote}</p> : null}
    </HomeSection>
  );
}

export function CompareTable({ block: b, ctx }: { block: CompareTableBlock; ctx: BlockContext }) {
  const rows = b.rows ?? [];
  if (!rows.length) return null;
  const free = b.freeHeading || "Free tools on your own";
  const us = b.usHeading || "Fourth Generation";
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`} tone="panel">
      <Title id={`${ctx.id}-title`} b={b} />
      <div className="hidden overflow-hidden rounded-lg border border-border bg-surface-1 lg:block">
        <table className="w-full table-fixed border-collapse text-body">
          <colgroup>
            <col className="w-7/17" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className="text-callout">
              <td className="px-7 py-4.5" />
              <th scope="col" className="px-7 py-4.5 text-left font-semibold text-ink-muted">
                {free}
              </th>
              <th scope="col" className="px-7 py-4.5 text-left font-semibold text-ink">
                {us}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? r.label} className="border-t border-border">
                <th scope="row" className="px-7 py-4.5 text-left font-medium text-ink">
                  {r.label}
                </th>
                <td className="px-7 py-4.5 text-ink-muted">{r.free}</td>
                <td className="px-7 py-4.5 font-semibold text-ink">{r.us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-6 lg:hidden">
        {rows.map((r) => (
          <li key={r.id ?? r.label} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-1 p-4">
            <span className="text-body font-semibold text-ink">{r.labelPhone || r.label}</span>
            <span className="text-callout text-ink-muted">Free tools: {r.freePhone || r.free}</span>
            <span className="text-callout font-semibold text-positive">With us: {r.usPhone || r.us}</span>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}

export async function TeamSection({ block: b, ctx }: { block: TeamSectionBlock; ctx: BlockContext }) {
  const nsmcUrl = env().NSMC_URL;
  const n = b.nsmc;
  const [team, reply] = await Promise.all([visibleTeam(ctx.market.code), b.replyLine?.includes("{time}") ? firstReplyMinutes() : null]);
  const replyLine = reply !== null && b.replyLine ? b.replyLine.replace("{time}", formatReplyTime(reply, "long")) : null;
  const intro = (
    <div className="flex max-w-170 flex-col gap-4">
      <Title id={`${ctx.id}-title`} b={b} />
      {replyLine ? <p className="text-callout text-ink-muted lg:text-site-lead">{replyLine}</p> : null}
      <EditorLink link={b.link} market={ctx.market} arrow className={cn(textLink, "w-fit text-body")} />
    </div>
  );
  return (
    <HomeSection id={b.anchor} labelledBy={`${ctx.id}-title`}>
      {team.length ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-18">
          {intro}
          <ul className="grid grid-cols-3 gap-2.5 lg:gap-5">
            {team.map((m) => (
              <li key={m.id} className="flex flex-col gap-1.5 lg:gap-3">
                <div className="h-30 overflow-hidden rounded-lg bg-surface-0 lg:h-60">
                  <MediaImage media={m.photo} sizes="(min-width: 1024px) 240px, 33vw" className="h-full object-cover" />
                </div>
                <p className="text-caption font-semibold text-ink lg:text-body">{m.name}</p>
                <p className="text-site-strip text-ink-muted lg:text-callout">{m.role}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        intro
      )}
      {nsmcUrl && n?.lead ? (
        <p className="flex flex-col gap-3 rounded-lg border border-border p-4 text-callout text-ink lg:flex-row lg:items-center lg:justify-between lg:px-7 lg:py-6 lg:text-body">
          <span>
            <strong className="font-semibold">
              <Words main={n.lead} phone={n.leadPhone} />
            </strong>{" "}
            {n.text ? (
              <span className="text-ink-muted">
                <Words main={n.text} phone={n.textPhone} />
              </span>
            ) : null}
          </span>
          <a href={nsmcUrl} rel="noopener" className={cn(textLink, "w-fit shrink-0")}>
            {n.linkLabel || "Visit NSMC"} <ArrowRight aria-hidden className="size-4" />
          </a>
        </p>
      ) : null}
    </HomeSection>
  );
}

export function ClosingBanner({ block: b, ctx }: { block: ClosingBannerBlock; ctx: BlockContext }) {
  return (
    <section aria-labelledby={`${ctx.id}-title`} className="defer-render bg-navy text-on-navy">
      <div className="page-container flex flex-col items-stretch gap-6 py-18 text-center lg:items-center lg:gap-7 lg:py-30">
        <h2 id={`${ctx.id}-title`} className="mx-auto max-w-225 text-site-closing-sm text-on-navy lg:text-site-closing">
          {b.heading}
        </h2>
        <EditorLink link={b.primary} market={ctx.market} className={button} />
      </div>
    </section>
  );
}
