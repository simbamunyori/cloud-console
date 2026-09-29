import { describe, expect, it } from "vitest";
import { assertStaffCan, canPublishWebsite, staffCan, websiteRoleOf } from "./access";

describe("staff permissions", () => {
  it("lets only finance and admins confirm payments", () => {
    expect(staffCan({ staffRole: "FINANCE" }, "confirmPayments")).toBe(true);
    expect(staffCan({ staffRole: "ADMIN" }, "confirmPayments")).toBe(true);
    expect(staffCan({ staffRole: "SUPPORT" }, "confirmPayments")).toBe(false);
    expect(staffCan({ staffRole: "PROVISIONING" }, "confirmPayments")).toBe(false);
  });

  it("keeps pricing to admins and lets every role read customers", () => {
    expect(staffCan({ staffRole: "FINANCE" }, "managePricing")).toBe(false);
    expect(staffCan({ staffRole: "ADMIN" }, "managePricing")).toBe(true);
    for (const staffRole of ["SUPPORT", "PROVISIONING", "FINANCE", "ADMIN"] as const) expect(staffCan({ staffRole }, "viewCustomers")).toBe(true);
    expect(() => assertStaffCan({ staffRole: "SUPPORT" }, "workTasks")).toThrow(/staff role/);
  });

  it("gives website roles only to staff, and always lets admins publish", () => {
    expect(websiteRoleOf({ staffRole: "ADMIN", websiteRole: null })).toBe("PUBLISHER");
    expect(websiteRoleOf({ staffRole: "ADMIN", websiteRole: "EDITOR" })).toBe("PUBLISHER");
    expect(websiteRoleOf({ staffRole: "SUPPORT", websiteRole: null })).toBeNull();
    expect(websiteRoleOf({ staffRole: "SUPPORT", websiteRole: "EDITOR" })).toBe("EDITOR");
    expect(websiteRoleOf({ staffRole: null, websiteRole: "PUBLISHER" })).toBeNull();
    expect(canPublishWebsite("EDITOR")).toBe(false);
    expect(canPublishWebsite("PUBLISHER")).toBe(true);
    expect(staffCan({ staffRole: "FINANCE" }, "manageStaff")).toBe(false);
    expect(staffCan({ staffRole: "ADMIN" }, "manageStaff")).toBe(true);
  });
});
