import { describe, expect, it } from "vitest";
import { STUB_PRODUCTS } from "../billing/stub/catalogue";
import { PRODUCTS } from "./seed-data";

describe("catalogue", () => {
  it("sells the local data copy under its own name, in both catalogues", () => {
    const product = PRODUCTS.find((p) => p.slug === "local-data-copy");
    expect(product).toMatchObject({ name: "Local data copy", category: "protection", billing: "local-data-copy" });
    expect(STUB_PRODUCTS.find((p) => p.key === "local-data-copy")?.name).toBe("Local data copy");
  });

  it("gives every product a billing product the stub has", () => {
    const keys = new Set<string>(STUB_PRODUCTS.map((p) => p.key));
    for (const p of PRODUCTS) expect(keys, p.slug).toContain(p.billing);
  });
});
