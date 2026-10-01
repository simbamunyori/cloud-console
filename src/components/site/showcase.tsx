/* eslint-disable @next/next/no-img-element -- fixed-size brand SVGs. */
import { cn } from "@/lib/cn";
import { demoAmount } from "@/config/demo";
import { formatMoney } from "@/lib/domain/money";

/**
 * Pictures of other brands, drawn in HTML so they stay sharp and light:
 * Thebe in its own brand, and the Kgale Logistics and Mothibi Attorneys
 * demo customers in theirs, never ours (docs/design). Each is a picture:
 * hidden from screen readers, with its meaning given by the caller.
 */

const shown = (minor: bigint, locale: string, currency: string) => formatMoney(demoAmount(minor, currency), locale);

export type DemoMoney = { locale: string; currency: string };

/** Kgale Logistics' mark: a rust tile with two chevrons. */
function KgaleMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <rect width="48" height="48" rx="6" className="fill-kgale-rust" />
      <path d="M14 11v26" className="stroke-kgale-white" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M20 11l11 13-11 13" className="stroke-kgale-white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M29 15l8 9-8 9" className="stroke-kgale-amber" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Lesedi Molefe's email signature at Kgale Logistics, as on a laptop (full) or a phone (compact). */
export function KgaleSignature({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div inert aria-hidden className="flex flex-col gap-2.5 border-t border-border pt-3">
        <div className="flex items-center gap-2.5">
          <KgaleMark size={38} />
          <p className="text-caption text-kgale-text">
            <strong className="text-callout font-semibold text-kgale-dark">Lesedi Molefe</strong>
            <br />
            <span className="text-kgale-rust">Accounts Manager, Kgale Logistics</span>
            <br />M +267 72 410 118
          </p>
        </div>
        <p className="rounded-sm bg-kgale-rust px-2.5 py-1.5 text-caption font-medium text-kgale-white">Same-day delivery across Greater Gaborone</p>
      </div>
    );
  }
  return (
    <div inert aria-hidden className="flex flex-col gap-3 border-t border-border pt-4.5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-4.5">
        <div className="flex flex-col items-start gap-2 border-kgale-rust sm:border-r-2 sm:pr-4.5">
          <KgaleMark size={52} />
          <span className="flex flex-col leading-none">
            <span className="text-callout font-bold tracking-widest text-kgale-dark">KGALE</span>
            <span className="mt-1 text-caption font-semibold tracking-label text-kgale-rust">LOGISTICS</span>
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-callout text-kgale-text">
          <span className="text-body font-semibold text-kgale-dark">Lesedi Molefe</span>
          <span className="font-medium text-kgale-rust">Accounts Manager, Kgale Logistics</span>
          <span>T +267 391 0420 · M +267 72 410 118</span>
          <span>lesedi@kgalelogistics.co.bw · kgalelogistics.co.bw</span>
          <span className="text-kgale-muted">Plot 22115, Gaborone West Industrial, Botswana</span>
        </div>
      </div>
      <p className="flex justify-between gap-3 rounded-sm bg-kgale-rust px-3.5 py-2 text-caption font-medium text-kgale-white">
        <span>Same-day delivery across Greater Gaborone</span>
        <span className="font-semibold text-kgale-amber">Book online</span>
      </p>
      <p className="text-caption text-kgale-fine">This email and any attachments are confidential and intended only for the named recipient.</p>
    </div>
  );
}

/** Mothibi Attorneys' mark: a gold M in a ruled navy square. */
function MothibiMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className="shrink-0">
      <rect width="44" height="44" className="fill-mothibi-ink" />
      <rect x="4" y="4" width="36" height="36" fill="none" className="stroke-mothibi-gold" strokeWidth="1" />
      <text x="22" y="30" textAnchor="middle" fontSize="22" fontWeight="600" className="fill-mothibi-gold font-showcase-serif">
        M
      </text>
    </svg>
  );
}

function MothibiLockup({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2.5">
      <MothibiMark size={size === "sm" ? 32 : 40} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-showcase-serif font-semibold tracking-widest text-mothibi-ink", size === "sm" ? "text-callout" : "text-headline")}>MOTHIBI</span>
        <span className="mt-1 text-caption font-semibold tracking-label text-mothibi-gold">ATTORNEYS</span>
      </span>
    </div>
  );
}

/** The Mothibi Attorneys example site in a browser frame. `compact` is the phone's shorter version and the menu's. */
export function MothibiSite({ compact = false }: { compact?: boolean }) {
  return (
    <div inert aria-hidden className="overflow-hidden rounded-lg border border-site-frame bg-surface-1">
      <div className={cn("flex items-center border-b border-border px-4 text-caption text-ink-muted", compact ? "h-7.5" : "h-9")}>mothibi-attorneys.co.bw</div>
      {compact ? (
        <div className="flex flex-col gap-3 bg-mothibi-paper px-4.5 py-5">
          <MothibiLockup size="sm" />
          <p className="font-showcase-serif text-title-1 font-semibold text-mothibi-ink">Clear legal advice for growing businesses.</p>
          <span className="w-fit rounded-sm bg-mothibi-ink px-3.5 py-2.5 text-callout font-semibold text-mothibi-white">Book a consultation</span>
        </div>
      ) : (
        <div className="flex flex-col bg-mothibi-white lg:h-115">
          <div className="flex h-16 items-center justify-between border-b border-mothibi-line px-7">
            <MothibiLockup />
            <span className="hidden items-center gap-4 text-caption whitespace-nowrap text-mothibi-nav xl:flex">
              <span>Practice areas</span>
              <span>Our attorneys</span>
              <span>Insights</span>
              <span>Contact</span>
              <span className="rounded-sm bg-mothibi-ink px-3.5 py-2 font-semibold text-mothibi-white">Book a consultation</span>
            </span>
          </div>
          <div className="grid flex-1 md:grid-cols-[1.05fr_1fr]">
            <div className="flex flex-col gap-4 bg-mothibi-paper px-8 py-10">
              <span className="text-caption font-semibold tracking-widest text-mothibi-kicker">COMMERCIAL · PROPERTY · EMPLOYMENT</span>
              <span className="font-showcase-serif text-display font-semibold text-mothibi-ink">Clear legal advice for growing businesses.</span>
              <span className="text-callout text-mothibi-muted">From your first contract to your first acquisition, one firm that knows your business.</span>
              <span className="mt-1 flex flex-wrap gap-3 text-callout font-semibold">
                <span className="rounded-sm bg-mothibi-ink px-4.5 py-3 text-mothibi-white">Book a consultation</span>
                <span className="rounded-sm border border-mothibi-ink px-4.5 py-3 text-mothibi-ink">Our practice areas</span>
              </span>
              <span className="mt-auto flex gap-7 text-caption whitespace-nowrap text-mothibi-stat">
                {[
                  ["17", "years in practice"],
                  ["6", "attorneys"],
                  ["400+", "businesses advised"],
                ].map(([n, l]) => (
                  <span key={l}>
                    <strong className="block text-title-2 text-mothibi-ink">{n}</strong>
                    {l}
                  </span>
                ))}
              </span>
            </div>
            <div className="relative hidden min-h-60 overflow-hidden bg-mothibi-ink md:block">
              <svg width="100%" height="100%" viewBox="0 0 380 380" preserveAspectRatio="xMidYMid slice" className="absolute inset-0">
                <rect width="380" height="380" className="fill-mothibi-ink" />
                <path d="M24 118 L190 50 L356 118 Z" className="fill-mothibi-stone" />
                <rect x="24" y="118" width="332" height="10" className="fill-mothibi-gold" />
                {[40, 92, 144, 196, 248, 300].map((x) => (
                  <rect key={x} x={x} y="120" width="26" height="170" className="fill-mothibi-stone" />
                ))}
                <rect x="16" y="290" width="348" height="14" className="fill-mothibi-stone" />
                <rect x="0" y="304" width="380" height="80" className="fill-mothibi-ground" />
              </svg>
              <p className="absolute inset-x-5 bottom-5 rounded-sm bg-mothibi-white/95 px-4 py-3.5 text-callout text-mothibi-ink">
                <strong>Plot 50369, Fairgrounds Office Park, Gaborone</strong>
                <br />
                Monday to Friday, 08:00 to 17:00 · +267 395 8100
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const REQUESTS = [
  { what: "Laptop for new hire", by: "Operations · Tumelo", amount: 1_490_000n, state: "Approved", ok: true },
  { what: "Client lunch, Sales", by: "Sales · Lesedi", amount: 185_000n, state: "With finance", ok: false },
  { what: "Fuel for delivery fleet", by: "Logistics · Neo", amount: 650_000n, state: "Needs your approval", ok: false },
] as const;

/** Thebe's home screen for Kgale Logistics, in Thebe's brand, with amounts in the market's currency. */
export function ThebeScreen({ money: m, compact = false }: { money: DemoMoney; compact?: boolean }) {
  const fmt = (n: bigint) => shown(n, m.locale, m.currency);
  if (compact) {
    const fuel = REQUESTS[2];
    return (
      <div inert aria-hidden className="flex flex-col gap-3 rounded-lg bg-thebe-panel p-4 font-thebe text-thebe-ink">
        <div className="rounded-lg border border-thebe-panel-line bg-thebe-white p-3.5">
          <p className="text-caption text-thebe-panel-muted">Available to spend this month</p>
          <p className="text-title-1 font-semibold">{fmt(12_845_000n)}</p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-thebe-panel-line bg-thebe-white px-3.5 py-3 text-callout">
          <span>
            <strong>{fuel.what}</strong>
            <br />
            <span className="text-thebe-panel-muted">Logistics · {fmt(fuel.amount)}</span>
          </span>
          <span className="shrink-0 rounded-sm bg-thebe-wait-bg px-2 py-1 text-caption font-semibold text-thebe-wait-text">Needs approval</span>
        </div>
      </div>
    );
  }
  return (
    <div inert aria-hidden className="overflow-hidden rounded-lg bg-thebe-panel font-thebe text-thebe-ink">
      <div className="flex h-13 items-center gap-2.5 border-b border-thebe-panel-line bg-thebe-white px-5">
        <img src="/brand/thebe/thebe-mark-teal.svg" alt="" width={22} height={22} />
        <span className="text-callout font-semibold">Kgale Logistics</span>
        <span className="ml-auto text-caption text-thebe-panel-muted">Operating account</span>
      </div>
      <div className="flex flex-col gap-4.5 p-5 xl:p-6.5">
        <div className="rounded-lg border border-thebe-panel-line bg-thebe-white p-5.5">
          <p className="text-caption text-thebe-panel-muted">Available to spend this month</p>
          <p className="text-site-stat font-semibold">{fmt(12_845_000n)}</p>
          <p className="text-caption text-thebe-panel-muted">Across 4 teams, after {fmt(6_690_000n)} approved or committed</p>
        </div>
        <div className="rounded-lg border border-thebe-panel-line bg-thebe-white">
          <p className="flex justify-between border-b border-thebe-panel-line px-5 py-3.5 text-callout font-semibold">
            <span>Requests</span>
            <span className="text-caption font-normal text-thebe-panel-muted">2 waiting</span>
          </p>
          {REQUESTS.map((r) => (
            <div key={r.what} className="flex items-center gap-3.5 border-b border-thebe-row-line px-5 py-3.5 text-callout last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{r.what}</span>
                <span className="text-caption text-thebe-panel-muted">{r.by}</span>
              </span>
              <span className="font-semibold tabular-nums">{fmt(r.amount)}</span>
              <span className={cn("hidden rounded-sm px-2.5 py-1 text-caption font-semibold sm:inline", r.ok ? "bg-thebe-ok-bg text-thebe-ok-text" : "bg-thebe-wait-bg text-thebe-wait-text")}>{r.state}</span>
            </div>
          ))}
        </div>
        <p className="text-caption text-thebe-panel-muted">Every request recorded · Weekly spending report sent Monday 07:00</p>
      </div>
    </div>
  );
}
