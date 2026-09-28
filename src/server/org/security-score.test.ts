import { describe, expect, it } from "vitest";
import { securityChecks, securityScore, type SecurityFacts } from "./security-score";

const good: SecurityFacts = { withoutTwoStep: 0, backupCodesLeft: 10, inactiveMembers: 0, admins: 2, hasProductivity: true, hasMailboxBackup: true, hasThreatMonitoring: true };

describe("security score", () => {
  it("adds up to 100 when every check passes", () => {
    const checks = securityChecks(good);
    expect(checks.reduce((s, c) => s + c.points, 0)).toBe(100);
    expect(securityScore(checks)).toBe(100);
  });

  it("takes points off for each thing to fix, with a link to fix it", () => {
    const checks = securityChecks({ ...good, backupCodesLeft: 1, inactiveMembers: 2, hasMailboxBackup: false, hasThreatMonitoring: false });
    expect(securityScore(checks)).toBe(100 - 10 - 15 - 20 - 20);
    const failed = checks.filter((c) => !c.passed);
    expect(failed.map((c) => c.title)).toEqual(["Only 1 backup code left", "2 people haven't signed in for 90 days", "Email and documents aren't backed up", "No one is watching for threats"]);
    expect(failed.every((c) => c.fix.href.startsWith("/app/"))).toBe(true);
  });

  it("names who hasn't finished two-step login, and missing backup codes", () => {
    const checks = securityChecks({ ...good, withoutTwoStep: 3, backupCodesLeft: 0 });
    expect(checks.filter((c) => !c.passed).map((c) => c.title)).toEqual(["3 people haven't finished two-step login", "You have no backup codes"]);
  });

  it("doesn't ask for a backup of email the organisation doesn't have with us", () => {
    expect(securityChecks({ ...good, hasProductivity: false, hasMailboxBackup: false }).find((c) => c.key === "backup")?.passed).toBe(true);
  });
});
