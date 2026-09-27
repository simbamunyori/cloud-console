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

describe("the visitor's country", () => {
  it("comes from the CDN header first, and nothing else is asked when it answers", async () => {
    vi.resetModules();
    const request = new Headers({ "cf-ipcountry": "ZA", "x-forwarded-for": "8.8.8.8" });
    vi.doMock("next/headers", () => ({ headers: async () => request }));
    const { requestCountry } = await import("./geo");
    expect(await requestCountry()).toBe("ZA");
    request.set("cf-ipcountry", "XX");
    // Unknown to Cloudflare, and no GeoLite2 database here: nobody can tell.
    expect(await requestCountry()).toBeUndefined();
    vi.doUnmock("next/headers");
  });
});
