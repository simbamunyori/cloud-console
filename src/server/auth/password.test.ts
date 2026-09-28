import { describe, expect, it } from "vitest";
import { hashPassword, passwordStrength, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("correct-horse-batterY", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password-here")).not.toBe(await hashPassword("same-password-here"));
  });

  it("judges strength by length and obvious patterns", () => {
    expect(passwordStrength("short")).toBe("too-short");
    expect(passwordStrength("aaaaaaaaaaaaaa")).toBe("weak");
    expect(passwordStrength("password12345")).toBe("weak");
    expect(passwordStrength("simba-rocks-2026", ["simba@nsmc.africa"])).toBe("weak");
    expect(passwordStrength("correct-horse-battery")).toBe("strong");
  });
});
