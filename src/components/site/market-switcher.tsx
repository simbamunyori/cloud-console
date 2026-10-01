import { Check, ChevronDown, Globe } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SwitcherMarket {
  code: string;
  name: string;
  currency: string;
}

/**
 * The country switcher, in the header and footer. Each choice goes through
 * /switch-market, which remembers it in a cookie that beats detection, then
 * opens the same page in that market. A disclosure, so it works without
 * JavaScript and from the keyboard. `up` opens the list upwards, as at the
 * bottom of the phone menu.
 */
export function MarketSwitcher({
  markets,
  current,
  path,
  align = "end",
  tone = "default",
  up = false,
  variant = "button",
}: {
  markets: SwitcherMarket[];
  current: SwitcherMarket;
  path: string;
  align?: "start" | "end";
  tone?: "default" | "navy";
  up?: boolean;
  /** "strip": the small "Botswana · BWP" of the top strip and the footer's bottom bar. */
  variant?: "button" | "strip";
}) {
  return (
    <details className="group relative">
      {variant === "strip" ? (
        <summary className={cn("flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden", tone === "navy" ? "hover:text-on-navy" : "hover:text-ink")}>
          <span className="sr-only">Country and currency: </span>
          {current.name} · {current.currency}
          <ChevronDown aria-hidden className="size-3 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
      ) : (
        <summary
          className={cn(
            "flex h-10 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-callout font-medium [&::-webkit-details-marker]:hidden",
            tone === "navy" ? "text-on-navy hover:bg-on-navy/10" : "text-ink hover:bg-surface-2",
          )}
          aria-label={`Country: ${current.name}. Change country`}
        >
          <Globe aria-hidden className="size-4" />
          <span>{current.name}</span>
          <ChevronDown aria-hidden className="size-4 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
      )}
      <ul
        className={cn(
          "absolute z-20 mt-2 flex w-64 flex-col rounded-md border border-border bg-surface-1 p-1 text-ink shadow-elevation-3",
          align === "end" ? "right-0" : "left-0",
          tone === "navy" || up ? "bottom-full mb-2" : "top-full",
        )}
      >
        {markets.map((m) => (
          <li key={m.code}>
            <a
              href={`/switch-market?to=${m.code}&path=${encodeURIComponent(path)}`}
              rel="nofollow"
              hrefLang={m.code}
              aria-current={m.code === current.code ? "true" : undefined}
              className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-3 text-callout hover:bg-surface-2"
            >
              <span>
                {m.name} <span className="text-ink-muted">{m.currency}</span>
              </span>
              {m.code === current.code ? <Check aria-hidden className="size-4 text-link" /> : null}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
