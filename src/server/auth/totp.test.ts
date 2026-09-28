import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, groupSecret, hotp, otpauthUri, totpAt, verifyTotp } from "./totp";

const RFC_SECRET = Buffer.from("12345678901234567890");

describe("hotp and totp", () => {
  it("matches the RFC 4226 test values", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it("matches the RFC 6238 SHA-1 test values", () => {
    const cases: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [t, code] of cases) expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(code);
  });

  it("round-trips base32", () => {
    expect(base32Encode(Buffer.from("Hello!\xde\xad\xbe\xef", "latin1"))).toBe("JBSWY3DPEHPK3PXP");
    expect(base32Decode("jbsw y3dp ehpk 3pxp").toString("latin1")).toBe("Hello!\xde\xad\xbe\xef");
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });
});

describe("verifyTotp", () => {
  const secret = generateTotpSecret();
  const at = new Date("2026-09-24T12:00:10Z");

  it("accepts the current code and one step of drift", () => {
    expect(verifyTotp(secret, totpAt(secret, at), { at })).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, new Date(at.getTime() - 30_000)), { at })).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, new Date(at.getTime() + 30_000)), { at })).not.toBeNull();
  });

  it("refuses codes further out", () => {
    expect(verifyTotp(secret, totpAt(secret, new Date(at.getTime() - 90_000)), { at })).toBeNull();
  });

  it("refuses a replayed code", () => {
    const step = verifyTotp(secret, totpAt(secret, at), { at })!;
    expect(verifyTotp(secret, totpAt(secret, at), { at, lastUsedStep: step })).toBeNull();
  });

  it("ignores spaces and refuses junk", () => {
    const code = totpAt(secret, at);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { at })).not.toBeNull();
    expect(verifyTotp(secret, "12345", { at })).toBeNull();
    expect(verifyTotp(secret, "abcdef", { at })).toBeNull();
  });
});

describe("otpauth link", () => {
  it("names the issuer and the account", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "simba@nsmc.africa", "Cloud Console");
    expect(uri).toBe(
      "otpauth://totp/Cloud%20Console%3Asimba%40nsmc.africa?secret=JBSWY3DPEHPK3PXP&issuer=Cloud+Console&algorithm=SHA1&digits=6&period=30",
    );
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
  });
});
