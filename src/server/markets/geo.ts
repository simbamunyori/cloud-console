import "server-only";
import { headers } from "next/headers";
import { env } from "@/server/env";

/**
 * The visitor's country. First the header the CDN adds (Cloudflare's
 * cf-ipcountry by default; the name is GEO_COUNTRY_HEADER), then a
 * GeoLite2 Country lookup of their address when GEOLITE2_DB_PATH points
 * at the database file. Undefined when neither can tell.
 */

/** Cloudflare sends "XX" when it can't tell and "T1" for Tor; both count as unknown. */
export function countryFromHeader(value: string | null | undefined): string | undefined {
  const v = value?.trim().toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : undefined;
}

type CountryReader = { get(ip: string): { country?: { iso_code?: string }; registered_country?: { iso_code?: string } } | null };
let reader: Promise<CountryReader | null> | undefined;

function geoLite(): Promise<CountryReader | null> {
  const path = env().GEOLITE2_DB_PATH;
  if (!path) return Promise.resolve(null);
  reader ??= import("maxmind")
    .then((m) => m.default.open(path) as Promise<CountryReader>)
    .catch((e) => {
      console.error(`GeoLite2 database at ${path} couldn't be opened: ${e instanceof Error ? e.message : e}`);
      return null;
    });
  return reader;
}

export async function countryFromAddress(ip: string | null | undefined): Promise<string | undefined> {
  if (!ip) return undefined;
  const db = await geoLite();
  if (!db) return undefined;
  try {
    const hit = db.get(ip);
    return countryFromHeader(hit?.country?.iso_code ?? hit?.registered_country?.iso_code);
  } catch {
    return undefined;
  }
}

export async function requestCountry(): Promise<string | undefined> {
  const h = await headers();
  const fromHeader = countryFromHeader(h.get(env().GEO_COUNTRY_HEADER));
  if (fromHeader) return fromHeader;
  // The first X-Forwarded-For entry is the client when a proxy we trust sets it (see middleware).
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  return countryFromAddress(ip);
}
