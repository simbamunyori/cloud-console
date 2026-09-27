import { createHash, randomInt } from "node:crypto";

export const RECOVERY_CODE_COUNT = 10;

/** No 0/O or 1/I/L, so codes survive being written down. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Ten codes like "K7QM-4TZP". Each works once. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let s = "";
    for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    codes.add(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return [...codes];
}

export function normaliseRecoveryCode(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecoveryCode(code)).digest("hex");
}

export function looksLikeRecoveryCode(input: string): boolean {
  return /^[A-Z0-9]{8}$/.test(input.toUpperCase().replace(/[^A-Z0-9]/g, "")) && !/^\d+$/.test(input.trim());
}
