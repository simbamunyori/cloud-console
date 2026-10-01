import "server-only";
import { cookies } from "next/headers";

/**
 * The site's cart: domain names a visitor picked before they have an
 * account. Kept in a cookie for 30 days; the console offers to register
 * them after sign-up and sign-in. Names only, never prices: prices are
 * always read from the price book when shown.
 */

const COOKIE = "fgt_cart";
const MAX = 10;
const NAME = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,63})+$/;

export const isDomainName = (name: string) => NAME.test(name);

export function parseCart(raw: string | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((n): n is string => typeof n === "string" && isDomainName(n)))].slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export async function readCart(): Promise<string[]> {
  return parseCart((await cookies()).get(COOKIE)?.value);
}

export async function writeCart(names: string[]) {
  const jar = await cookies();
  const clean = parseCart(JSON.stringify(names));
  if (!clean.length) jar.delete(COOKIE);
  else jar.set(COOKIE, JSON.stringify(clean), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86_400 });
}

export async function addToCart(name: string) {
  const n = name.trim().toLowerCase();
  if (!isDomainName(n)) return readCart();
  const next = [...(await readCart()).filter((x) => x !== n), n].slice(-MAX);
  await writeCart(next);
  return next;
}

export async function removeFromCart(name: string) {
  const next = (await readCart()).filter((x) => x !== name.trim().toLowerCase());
  await writeCart(next);
  return next;
}
