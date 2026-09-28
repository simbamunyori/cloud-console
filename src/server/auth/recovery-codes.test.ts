import { describe, expect, it } from "vitest";
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode, normaliseRecoveryCode } from "./recovery-codes";

describe("recovery codes", () => {
  it("makes ten distinct, readable codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("forgives case, spaces and missing dashes", () => {
    expect(normaliseRecoveryCode("k7qm 4tzp")).toBe("K7QM-4TZP");
    expect(hashRecoveryCode("k7qm4tzp")).toBe(hashRecoveryCode("K7QM-4TZP"));
  });

  it("tells a backup code from an app code", () => {
    expect(looksLikeRecoveryCode("K7QM-4TZP")).toBe(true);
    expect(looksLikeRecoveryCode("482913")).toBe(false);
    expect(looksLikeRecoveryCode("12345678")).toBe(false);
  });
});
