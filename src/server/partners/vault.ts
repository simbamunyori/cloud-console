import { hkdfSync } from "node:crypto";
import { open, seal } from "@/server/auth/secret-box";
import { totpKey } from "@/server/secrets";

/**
 * Seals partner credentials stored in the database (Admin > Partners).
 * The key is derived from TOTP_ENCRYPTION_KEY, so no new server setting is
 * needed and a database dump alone reveals nothing.
 */

function partnerKey(): string {
  const derived = hkdfSync("sha256", Buffer.from(totpKey(), "base64"), Buffer.alloc(0), "fgt-console:partner-settings:v1", 32);
  return Buffer.from(derived).toString("base64");
}

export function sealSecrets(values: Record<string, string>): string {
  return seal(JSON.stringify(values), partnerKey());
}

export function openSecrets(sealed: string | null | undefined): Record<string, string> {
  if (!sealed) return {};
  const parsed: unknown = JSON.parse(open(sealed, partnerKey()));
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
}

/** One value, such as a transfer code waiting for payment. */
export const sealValue = (value: string) => seal(value, partnerKey());
export const openValue = (sealed: string) => open(sealed, partnerKey());
