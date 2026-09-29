/**
 * Prices always come live from the price books, so none may be typed into
 * a page. This finds anything that reads as an amount of money: a
 * currency before or after a number ("P 120", "R99", "$15", "120 BWP",
 * "US$ 12.50", "40 pula").
 */

const SYMBOL_FIRST = /(?:^|[\s(])(?:P|R|\$|US\$|BWP|ZAR|USD|ZWG|ZiG|€|£)\s?\d/;
const SYMBOL_AFTER = /\d[\d,. ]*\s?(?:BWP|ZAR|USD|ZWG|ZiG|pula|rand|dollars?|thebe)\b/i;

export function looksLikePrice(text: string): boolean {
  return SYMBOL_FIRST.test(text) || SYMBOL_AFTER.test(text);
}

export const PRICE_MESSAGE = "Prices can't be typed into a page. Add a Pricing block instead: it shows the live price from the price book in each market.";

/** A Payload field validator for text: refuses prices, then applies the field's own required rule. */
export function noPrices(value: unknown, { required }: { required?: boolean } = {}): true | string {
  const values = Array.isArray(value) ? value : [value];
  if (values.some((v) => typeof v === "string" && looksLikePrice(v))) return PRICE_MESSAGE;
  if (required && (value === undefined || value === null || (typeof value === "string" && !value.trim()))) return "This field is required.";
  return true;
}

/** Every piece of text in a rich text (Lexical) value. */
export function richTextStrings(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: unknown; children?: unknown[]; root?: unknown };
    if (typeof n.text === "string") out.push(n.text);
    if (n.root) walk(n.root);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(value);
  return out;
}
