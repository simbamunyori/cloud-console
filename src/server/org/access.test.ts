import type { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, canAssignRole, type Permission, ROLES } from "./access";

const EXPECTED: Record<Role, Permission[]> = {
  OWNER: ["view", "order", "pay", "manageTeam", "manageOrganisation", "support", "viewSecurity", "closeAccount"],
  ADMIN: ["view", "order", "pay", "manageTeam", "manageOrganisation", "support", "viewSecurity"],
  BILLING: ["view", "pay", "support"],
  READ_ONLY: ["view", "support"],
};
const ALL: Permission[] = EXPECTED.OWNER;

describe("role permissions", () => {
  for (const role of ROLES) {
    it(`${role} can do exactly what the brief allows`, () => {
      expect(ALL.filter((p) => can({ role }, p))).toEqual(EXPECTED[role]);
    });
  }

  it("lets only owners give or take away the owner role", () => {
    expect(canAssignRole({ role: "OWNER" }, "OWNER")).toBe(true);
    expect(canAssignRole({ role: "ADMIN" }, "OWNER")).toBe(false);
    expect(canAssignRole({ role: "ADMIN" }, "BILLING")).toBe(true);
    expect(canAssignRole({ role: "BILLING" }, "READ_ONLY")).toBe(false);
    expect(canAssignRole({ role: "READ_ONLY" }, "READ_ONLY")).toBe(false);
  });
});
