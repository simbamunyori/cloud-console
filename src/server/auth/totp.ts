import { createHmac, randomBytes } from "node:crypto";

/** RFC 6238 TOTP with the defaults every authenticator app supports. */
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 encoded as authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return bin.toString().padStart(digits, "0");
}

export function timeStep(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD);
}

export function totpAt(secretBase32: string, at: Date = new Date()): string {
  return hotp(base32Decode(secretBase32), timeStep(at));
}

/**
 * Checks a code against the current step and one step either side, to
 * allow for clock drift. Returns the matched step so the caller can
 * refuse it next time, or null. Steps at or before `lastUsedStep` are
 * refused, so a code can't be replayed.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { at?: Date; lastUsedStep?: number | null; window?: number } = {},
): number | null {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretBase32);
  const now = timeStep(opts.at);
  const window = opts.window ?? 1;
  for (let step = now - window; step <= now + window; step++) {
    if (opts.lastUsedStep != null && step <= opts.lastUsedStep) continue;
    if (hotp(secret, step) === digits) return step;
  }
  return null;
}

/** The otpauth:// link encoded in the QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" for typing by hand. */
export function groupSecret(secretBase32: string): string {
  return secretBase32.replace(/(.{4})(?=.)/g, "$1 ");
}
