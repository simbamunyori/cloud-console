import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** OWASP-recommended scrypt cost for interactive logins. */
const N = 2 ** 17;
const r = 8;
const p = 1;
const KEYLEN = 32;
const MAXMEM = 256 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordStrength = "too-short" | "weak" | "strong";

/**
 * Length is what matters. Reject short passwords and a few obvious
 * patterns; otherwise accept whatever the person chooses.
 */
export function passwordStrength(password: string, context: string[] = []): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) return "too-short";
  const lower = password.toLowerCase();
  if (/^(.)\1+$/.test(password)) return "weak";
  if (/^(0123456789|1234567890|abcdefghijkl|qwertyuiop|password)/.test(lower)) return "weak";
  for (const c of context) {
    const token = c.toLowerCase().split("@")[0].trim();
    if (token.length >= 4 && lower.includes(token)) return "weak";
  }
  return "strong";
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: MAXMEM,
  });
  return timingSafeEqual(key, expected);
}

/**
 * Used when the email is unknown so that a wrong email takes as long as
 * a wrong password, and response times don't reveal who has an account.
 */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}
