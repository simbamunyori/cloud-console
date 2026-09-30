import Link from "next/link";
import type { Media } from "@/cms/payload-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { HeroShot, ThebeIllustration, ThemedShot, type HomeMarket } from "../home";

export { BlockIcon } from "../icons";
export { linkHref, type CmsLinkValue } from "../links";
import { linkHref, type CmsLinkValue } from "../links";

/** What every block knows about the page it is on. */
export interface BlockContext {
  market: HomeMarket & { dataProtectionLaw?: string | null };
  /** Unique per block on the page, for headings' ids. */
  id: string;
}

export type Tone = "plain" | "light" | "dark";

/**
 * A section in one of the brand's three styles. Plain sections sit on the
 * page; light ones on a panel with rules above and below; dark ones on navy.
 */
export function Section({ tone, labelledBy, id, children, className }: { tone: Tone | null | undefined; labelledBy: string; id?: string | null; children: React.ReactNode; className?: string }) {
  const inner = "page-container";
  if (tone === "light" || tone === "dark") {
    return (
      <section id={id ?? undefined} aria-labelledby={labelledBy} className={cn(id && "scroll-mt-20", tone === "dark" ? "bg-navy text-ink-on-dark" : "border-y border-border bg-surface-1")}>
        <div className={cn(inner, tone === "dark" ? "py-16 lg:py-20 xl:py-24" : "py-16 lg:py-24 xl:py-28", className)}>{children}</div>
      </section>
    );
  }
  return (
    <section id={id ?? undefined} aria-labelledby={labelledBy} className={cn(inner, "py-16 lg:py-24 xl:py-28", id && "scroll-mt-20", className)}>
      {children}
    </section>
  );
}

/** A section's small heading, heading and introduction. */
export function Heading({ id, tone, kicker, heading, intro }: { id: string; tone?: Tone | null; kicker?: string | null; heading?: string | null; intro?: React.ReactNode }) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex max-w-3xl flex-col", dark ? "gap-4" : "gap-3")}>
      {kicker ? <p className={cn("label-kicker", dark ? "text-on-navy" : "text-link")}>{kicker}</p> : null}
      <h2 id={id} className={cn("text-title-1 sm:text-display xl:text-display-lg", dark ? "max-w-3xl text-on-navy" : "text-ink")}>
        {heading}
      </h2>
      {intro ? <p className={cn("max-w-2xl text-body xl:text-headline xl:font-normal", dark ? "" : "text-ink-muted")}>{intro}</p> : null}
    </div>
  );
}

/** A card's surface: raised off a plain page, or sunk into a light panel. */
export const cardSurface = (tone: Tone | null | undefined) => (tone === "light" ? "bg-surface-0" : "bg-surface-1");

export function CmsButton({ link, market, variant }: { link: CmsLinkValue | null | undefined; market: HomeMarket; variant?: "secondary" }) {
  const href = linkHref(link, market);
  if (!href) return null;
  return (
    <Button asChild size="lg" variant={variant}>
      {href.startsWith("mailto:") ? <a href={href}>{link!.label}</a> : <Link href={href}>{link!.label}</Link>}
    </Button>
  );
}

export function CmsTextLink({ link, market, className }: { link: CmsLinkValue | null | undefined; market: HomeMarket; className?: string }) {
  const href = linkHref(link, market);
  if (!href) return null;
  const cls = cn("text-callout font-semibold text-link hover:underline", className);
  return href.startsWith("mailto:") ? (
    <a href={href} className={cls}>
      {link!.label}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {link!.label}
    </Link>
  );
}

/** An uploaded image at the widths the media library made. */
export function MediaImage({ media, sizes, className, priority }: { media: number | Media | null | undefined; sizes: string; className?: string; priority?: boolean }) {
  if (!media || typeof media !== "object" || !media.url) return null;
  const s = media.sizes;
  const set = [
    [s?.thumbnail?.url, s?.thumbnail?.width],
    [s?.medium?.url, s?.medium?.width],
    [s?.large?.url, s?.large?.width],
  ]
    .filter(([u, w]) => u && w)
    .map(([u, w]) => `${u} ${w}w`)
    .join(", ");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={s?.medium?.url ?? media.url}
      srcSet={set || undefined}
      sizes={sizes}
      alt={media.alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={priority ? undefined : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("block h-auto w-full", className)}
    />
  );
}

export interface PictureValue {
  source: "upload" | "console-home" | "console-invoice" | "thebe-approvals";
  image?: number | Media | null;
  caption?: string | null;
}

const INVOICE_ALT = "A monthly invoice in the Cloud Console, with each line explained and what changed since last month";

/** The picture itself, without its frame. */
export function PictureBody({ picture, market, hero }: { picture: PictureValue; market: HomeMarket; hero?: boolean }) {
  switch (picture.source) {
    case "console-home":
      return <HeroShot />;
    case "console-invoice":
      return <ThemedShot name="console-invoice" width={1280} height={960} alt={INVOICE_ALT} />;
    case "thebe-approvals":
      return <ThebeIllustration currency={market.currency} locale={market.locale} />;
    default:
      return <MediaImage media={picture.image} priority={hero} sizes={hero ? "(min-width: 1536px) 840px, (min-width: 1024px) 56vw, 100vw" : "(min-width: 1024px) 560px, calc(100vw - 32px)"} />;
  }
}

/** The drawing is decorative; its caption is for screen readers only. */
export const captionFor = (picture: PictureValue) =>
  picture.caption || (picture.source === "thebe-approvals" ? "An illustration of Thebe's list of payments waiting for approval." : null);

export function hasPicture(picture: PictureValue | null | undefined): picture is PictureValue {
  return Boolean(picture && (picture.source !== "upload" || (picture.image && typeof picture.image === "object")));
}
