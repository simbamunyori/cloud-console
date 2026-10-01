import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FeatureView } from "./frame-content";
import { MothibiSite, ThebeScreen, type DemoMoney } from "./showcase";

export interface FeatureContext {
  code: string;
  money: DemoMoney;
  contact: { email: string; phone: string | null; hours: string };
  thebe: { tryUrl?: string; demoUrl?: string };
  /** The approved partner marked for email (Proof), for the Email menu's badge. */
  partner?: { badge: string; link: string | null } | null;
}

const box = "flex h-full flex-col gap-3 rounded-lg bg-surface-0 p-6";

/** A menu's feature area. Null when it has nothing approved to show, so the column stays empty rather than holding a placeholder. */
export function MenuFeature({ feature: f, ctx }: { feature: FeatureView | null; ctx: FeatureContext }) {
  if (!f) return null;
  const heading = f.heading ? <p className="text-headline text-ink">{f.heading}</p> : null;
  const text = f.text ? <p className="text-callout text-ink-muted">{f.text}</p> : null;
  const more = f.link ? (
    <Link href={f.link.href} className="mt-auto inline-flex items-center gap-1 text-callout font-semibold text-link hover:underline">
      {f.link.label} <ArrowRight aria-hidden className="size-4" />
    </Link>
  ) : null;
  switch (f.kind) {
    case "domainSearch":
      return (
        <form action={`/${ctx.code}`} method="get" role="search" className={box}>
          {heading}
          {text}
          <label htmlFor="menu-domain" className="sr-only">
            Domain name
          </label>
          <div className="flex gap-2">
            <input id="menu-domain" name="domain" placeholder="yourcompany" autoCapitalize="none" autoComplete="off" spellCheck={false} className="h-11 min-w-0 flex-1 rounded-sm border border-site-frame bg-surface-1 px-3 text-body text-ink placeholder:text-ink-muted" />
            <Button type="submit" size="md">
              <Search aria-hidden /> Search
            </Button>
          </div>
        </form>
      );
    case "websitePreview":
      return (
        <div className={box}>
          {heading}
          <MothibiSite compact />
          <p className="sr-only">An example website we built: Mothibi Attorneys.</p>
          {text}
          {more}
        </div>
      );
    case "thebe":
      return (
        <div className={box}>
          {heading}
          {text}
          <ThebeScreen money={ctx.money} compact />
          {ctx.thebe.tryUrl || ctx.thebe.demoUrl ? (
            <div className="flex flex-wrap items-center gap-4">
              {ctx.thebe.tryUrl ? (
                <a href={ctx.thebe.tryUrl} className="inline-flex h-10 items-center rounded-sm bg-thebe-teal px-4 font-thebe text-callout font-semibold text-thebe-white">
                  Try Thebe
                </a>
              ) : null}
              {ctx.thebe.demoUrl ? (
                <a href={ctx.thebe.demoUrl} className="text-callout font-semibold text-link hover:underline">
                  Book a demo
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    case "support":
      return (
        <div className={box}>
          {heading}
          {ctx.contact.hours ? <p className="text-callout text-ink-muted">{ctx.contact.hours}</p> : null}
          {ctx.contact.phone ? (
            <a href={`tel:${ctx.contact.phone.replace(/\s/g, "")}`} className="text-title-2 text-ink hover:text-link">
              {ctx.contact.phone}
            </a>
          ) : null}
          <a href={`mailto:${ctx.contact.email}`} className="text-callout font-semibold break-all text-link hover:underline">
            {ctx.contact.email}
          </a>
        </div>
      );
    case "note":
      return heading || text ? (
        <div className={box}>
          {heading}
          {text}
          {more}
        </div>
      ) : null;
    case "partnerBadge":
      if (!ctx.partner) return null;
      return (
        <div className={box}>
          <p className="text-caption text-ink-muted">Official</p>
          <p className="text-headline text-ink">{ctx.partner.badge}</p>
          {heading}
          {text}
          {ctx.partner.link ? (
            <a href={ctx.partner.link} rel="noopener" className="mt-auto inline-flex items-center gap-1 text-callout font-semibold text-link hover:underline">
              See our listing <ArrowRight aria-hidden className="size-4" />
            </a>
          ) : (
            more
          )}
        </div>
      );
    default:
      return null;
  }
}
