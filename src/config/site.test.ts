import { describe, expect, it } from "vitest";
import { domainQuickPicks, marketCopy, SERVICES, withDataCentre } from "./site";

describe("site copy", () => {
  it("claims our own data centre only where the market says it is live", () => {
    const servers = SERVICES.find((s) => s.key === "servers")!.body;
    expect(servers).toBe("Managed servers, monitored and backed up.");
    expect(withDataCentre(servers, { ownDataCentre: false })).not.toMatch(/data centre/i);
    expect(withDataCentre(servers, { ownDataCentre: true })).toMatch(/our own data centre/);
    for (const card of SERVICES) expect(card.body).not.toMatch(/data centre/i);
  });

  it("doesn't mention local hosting until Local data copy is offered", () => {
    for (const m of ["bw", "za", "zw", "global"]) expect(marketCopy(m).localHosting).toBeUndefined();
  });

  it("offers .com after the market's own domain endings, once", () => {
    expect(domainQuickPicks([".co.bw", ".bw"])).toEqual([".co.bw", ".bw", ".com"]);
    expect(domainQuickPicks([".com", ".co.za"])).toEqual([".co.za", ".com"]);
    expect(domainQuickPicks([])).toEqual([".com"]);
  });
});
