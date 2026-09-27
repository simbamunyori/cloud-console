import "server-only";
import { headers } from "next/headers";
import { env } from "@/server/env";

/**
 * The visitor's country from the header the CDN adds (Cloudflare's
 * cf-ipcountry by default). Cloudflare sends "XX" when it can't tell and
 * "T1" for Tor; both count as unknown.
 */
export function countryFromHeader(value: string | null | undefined): string | undefined {
  const v = value?.trim().toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : undefined;
}

export async function requestCountry(): Promise<string | undefined> {
  return countryFromHeader((await headers()).get(env().GEO_COUNTRY_HEADER));
}
