import { cn } from "@/lib/cn";
import { formatMoney, type Money, type MoneyJson, fromJson } from "@/lib/domain/money";

const SIZES = {
  body: "text-body",
  headline: "text-headline",
  "title-2": "text-title-2",
  "title-1": "text-title-1",
  display: "text-display",
} as const;

/**
 * Every money figure on screen, written the way the customer's market
 * writes it. Tabular numerals so columns line up.
 */
export function Amount({
  value,
  locale,
  signed = false,
  size = "body",
  className,
}: {
  value: Money | MoneyJson;
  /** The organisation's (or market's) locale, e.g. "en-ZA". */
  locale: string;
  signed?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const m = typeof value.amountMinor === "string" ? fromJson(value as MoneyJson) : (value as Money);
  return <span className={cn("whitespace-nowrap tabular-nums", SIZES[size], className)}>{formatMoney(m, locale, { signed })}</span>;
}
