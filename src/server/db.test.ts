import { describe, expect, it } from "vitest";
import { scopeArgs } from "./db";

describe("scopeArgs", () => {
  it("filters reads by organisation", () => {
    expect(scopeArgs("Order", "findMany", { where: { archived: false } }, "org1")).toEqual({
      where: { archived: false, organisationId: "org1" },
    });
    expect(scopeArgs("Order", "findMany", undefined, "org1")).toEqual({ where: { organisationId: "org1" } });
  });

  it("overrides a different organisation in a filter", () => {
    expect(scopeArgs("Order", "count", { where: { organisationId: "org2" } }, "org1")).toEqual({
      where: { organisationId: "org1" },
    });
  });

  it("stamps creates and refuses writes into another organisation", () => {
    expect(scopeArgs("Ticket", "create", { data: { name: "Acme" } }, "org1")).toEqual({
      data: { name: "Acme", organisationId: "org1" },
    });
    expect(scopeArgs("Ticket", "createMany", { data: [{ name: "A" }] }, "org1")).toEqual({
      data: [{ name: "A", organisationId: "org1" }],
    });
    expect(() => scopeArgs("Ticket", "create", { data: { name: "A", organisationId: "org2" } }, "org1")).toThrow();
  });

  it("refuses to move a row between organisations", () => {
    expect(() => scopeArgs("Order", "update", { where: { id: "c" }, data: { organisationId: "org2" } }, "org1")).toThrow();
  });

  it("leaves models without an organisation alone", () => {
    const args = { where: { id: "u" } };
    expect(scopeArgs("User", "findUnique", args, "org1")).toBe(args);
  });
});
