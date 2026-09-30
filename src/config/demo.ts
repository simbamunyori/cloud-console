import { money, type Money } from "@/lib/domain/money";

/**
 * The public site's demo customers (Kgale Logistics and their Thebe) have
 * their amounts written in BWP. Other markets see them at a round rate in
 * their own currency, in whole units, so the pictures read naturally.
 * These are illustrations, never prices.
 */
const DEMO_RATES: Record<string, number> = { BWP: 1, ZAR: 1.35, USD: 0.075 };

export const demoAmount = (bwpMinor: bigint, currency: string): Money => money(BigInt(Math.round((Number(bwpMinor) / 100) * (DEMO_RATES[currency] ?? 1))) * 100n, currency);
