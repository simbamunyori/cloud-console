import { cn } from "@/lib/cn";
import { formatMoney, type Money, type MoneyJson, fromJson } from "@/lib/domain/money";

const SIZES = {
  body: "text-body",
  headline: "text-headline",
  "title-2": "text-title-2",
  "title-1": "text-title-1",
  display: "text-display",
} as const;

/** Every money figure on screen. Tabular numerals so columns line up. */
export function Amount({
  value,
  signed = false,
  size = "body",
  className,
}: {
  value: Money | MoneyJson;
  signed?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const m = typeof value.amountMinor === "string" ? fromJson(value as MoneyJson) : (value as Money);
  return <span className={cn("whitespace-nowrap tabular-nums", SIZES[size], className)}>{formatMoney(m, { signed })}</span>;
}
