import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("country from the CDN header", () => {
  it("reads a two-letter country and ignores Cloudflare's unknown and Tor codes", async () => {
    const { countryFromHeader } = await import("./geo");
    expect(countryFromHeader("za")).toBe("ZA");
    expect(countryFromHeader(" BW ")).toBe("BW");
    expect(countryFromHeader("XX")).toBeUndefined();
    expect(countryFromHeader("T1")).toBeUndefined();
    expect(countryFromHeader("")).toBeUndefined();
    expect(countryFromHeader(null)).toBeUndefined();
  });

  it("has no address lookup without a GeoLite2 database", async () => {
    const { countryFromAddress } = await import("./geo");
    expect(await countryFromAddress("8.8.8.8")).toBeUndefined();
  });
});
