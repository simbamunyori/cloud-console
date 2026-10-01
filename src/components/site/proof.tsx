/* eslint-disable @next/next/no-img-element -- logos are small uploads drawn at a fixed height. */
import { ArrowUpRight } from "lucide-react";
import type { ClientLogo, Media, Partner } from "@/cms/payload-types";
import { cn } from "@/lib/cn";

/**
 * Proof content (docs/FINAL_BUILD.md, Milestone 4) as the design draws it:
 * partner badges, client names or logos, and the proof numbers. Each list
 * arrives already approved and in the editor's order.
 */

const media = (m: number | Media | null | undefined): Media | null => (m && typeof m === "object" && m.url ? m : null);

/** A logo at a fixed height, from its smallest made size. */
function Logo({ m, className }: { m: Media; className?: string }) {
  return <img src={m.sizes?.thumbnail?.url ?? m.url!} alt={m.alt} loading="lazy" decoding="async" className={cn("w-auto object-contain", className)} />;
}

/** A partner badge: the official logo, or the partner's approved wording. Links to the partner's confirmation when there is one. */
export function PartnerBadge({ partner: p, className, tone = "light" }: { partner: Partner; className?: string; tone?: "light" | "navy" }) {
  const logo = media(p.logo);
  const inner = logo ? <Logo m={logo} className="max-h-10 max-w-full" /> : <span>{p.badge}</span>;
  const cls = cn(
    "flex items-center justify-center rounded-lg border px-2.5 text-center font-semibold",
    tone === "navy" ? "border-footer-field-line text-on-navy" : "border-border text-ink-muted",
    className,
  );
  if (!p.link) return <div className={cls}>{inner}</div>;
  return (
    <a href={p.link} rel="noopener" className={cn(cls, "hover:border-link")} aria-label={logo ? `${p.badge} (opens the partner's confirmation)` : undefined}>
      {inner}
    </a>
  );
}

/** The design's "Official / Microsoft partner" badge beside the email section's heading. */
export function EmailPartnerBadge({ partner: p }: { partner: Partner }) {
  return (
    <div className="flex h-14 w-full shrink-0 items-center justify-center rounded-lg border border-footer-field-line px-4.5 text-body font-semibold text-on-navy lg:h-18 lg:w-60 lg:flex-col lg:items-start lg:justify-center lg:text-headline">
      <span className="hidden text-caption font-normal text-footer-muted lg:block">Official</span>
      {p.link ? (
        <a href={p.link} rel="noopener" className="hover:underline">
          {p.badge}
        </a>
      ) : (
        p.badge
      )}
    </div>
  );
}

/** The proof numbers: four across on wide screens, two on phones, in one ruled panel. */
export function ProofNumbers({ numbers }: { numbers: { id: number; value: string; label: string }[] }) {
  return (
    <dl className={cn("grid overflow-hidden rounded-lg border border-border lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none", numbers.length > 1 && "grid-cols-2")}>
      {numbers.map((n) => (
        <div key={n.id} className="-mr-px -mb-px flex flex-col-reverse gap-1 border-r border-b border-border px-4 py-4.5 lg:gap-1.5 lg:px-7 lg:py-8">
          <dt className="text-caption text-ink-muted lg:text-body">{n.label}</dt>
          <dd className="text-title-1 font-semibold text-ink lg:text-site-stat">{n.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PartnerGrid({ partners, heading }: { partners: Partner[]; heading: string }) {
  return (
    <div className="flex flex-col gap-3 lg:gap-4.5">
      <h3 className="text-caption font-medium text-ink-muted lg:text-callout">{heading}</h3>
      <ul className="grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-4">
        {partners.map((p) => (
          <li key={p.id}>
            <PartnerBadge partner={p} className="h-14 text-caption lg:h-18 lg:text-callout" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Client names or logos. Phones leave them out, as designed. */
export function ClientGrid({ clients, heading, className }: { clients: ClientLogo[]; heading: string; className?: string }) {
  return (
    <div className={cn("flex-col gap-4.5", className)}>
      <h3 className="text-callout font-medium text-ink-muted">{heading}</h3>
      <ul className="grid grid-cols-3 gap-4 lg:grid-cols-6">
        {clients.map((c) => {
          const logo = media(c.logo);
          const inner = logo ? <Logo m={logo} className="max-h-10 max-w-full" /> : <span className="text-headline font-bold tracking-wide text-ink-muted">{c.company}</span>;
          return (
            <li key={c.id} className="flex h-16 items-center justify-center text-center">
              {c.website ? (
                <a href={c.website} rel="noopener" className="hover:opacity-80" aria-label={logo ? c.company : undefined}>
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A client website: its screenshot in a browser frame, the client and industry. */
export function ShowcaseCard({ site }: { site: { client: string; industry?: string | null; url?: string | null; screenshot: number | Media } }) {
  const shot = media(site.screenshot);
  if (!shot) return null;
  const host = site.url ? new URL(site.url).host : null;
  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <p className="flex h-7 items-center border-b border-border bg-surface-0 px-3 text-caption text-ink-muted">{host ?? site.client}</p>
        <img src={shot.sizes?.medium?.url ?? shot.url!} alt={shot.alt} loading="lazy" decoding="async" className="block aspect-video w-full object-cover object-top" />
      </div>
      <figcaption className="flex items-center justify-between gap-3 text-callout">
        <span>
          <span className="font-semibold text-ink">{site.client}</span>
          {site.industry ? <span className="text-ink-muted"> · {site.industry}</span> : null}
        </span>
        {site.url ? (
          <a href={site.url} rel="noopener" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
            Visit <span className="sr-only">{site.client}</span>
            <ArrowUpRight aria-hidden className="size-4" />
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
