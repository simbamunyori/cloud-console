/**
 * The security score on Home: a few checks an organisation can act on,
 * each worth points, adding up to 100. Pure, so it is easy to test; the
 * page gathers the facts.
 */

export interface SecurityFacts {
  /** Every member signs in with a password and an authenticator code. */
  everyoneHasTwoStep: boolean;
  /** Backup codes the person looking has left. */
  backupCodesLeft: number;
  /** Members who haven't signed in for 90 days or more (or never have, after 90 days). */
  inactiveMembers: number;
  /** Owners and admins, who can change the team and order. */
  admins: number;
  /** The organisation has email and documents with us (Microsoft 365 or Google Workspace). */
  hasProductivity: boolean;
  /** It has a backup of that email and those documents. */
  hasMailboxBackup: boolean;
  /** Threats are watched by our managed detection and response service. */
  hasThreatMonitoring: boolean;
}

export interface SecurityCheck {
  key: string;
  title: string;
  points: number;
  passed: boolean;
  /** What to do, and where, when it hasn't passed. */
  fix: { label: string; href: string };
}

export const INACTIVE_DAYS = 90;
export const MAX_ADMINS = 3;

export function securityChecks(f: SecurityFacts): SecurityCheck[] {
  return [
    { key: "two-step", title: "Two-step login for everyone", points: 25, passed: f.everyoneHasTwoStep, fix: { label: "Review your team", href: "/app/team" } },
    {
      key: "backup-codes",
      title: f.backupCodesLeft >= 3 ? "Backup codes ready" : `Only ${f.backupCodesLeft} backup ${f.backupCodesLeft === 1 ? "code" : "codes"} left`,
      points: 10,
      passed: f.backupCodesLeft >= 3,
      fix: { label: "Make new codes", href: "/app/security" },
    },
    {
      key: "inactive",
      title: f.inactiveMembers ? `${f.inactiveMembers} ${f.inactiveMembers === 1 ? "person hasn't" : "people haven't"} signed in for ${INACTIVE_DAYS} days` : "Everyone on the team is active",
      points: 15,
      passed: f.inactiveMembers === 0,
      fix: { label: "Remove old accounts", href: "/app/team" },
    },
    { key: "admins", title: f.admins > MAX_ADMINS ? `${f.admins} owners and admins` : "Few people can change the team", points: 10, passed: f.admins <= MAX_ADMINS, fix: { label: "Review roles", href: "/app/team" } },
    {
      key: "backup",
      title: f.hasProductivity ? (f.hasMailboxBackup ? "Email and documents backed up" : "Email and documents aren't backed up") : "Nothing to back up yet",
      points: 20,
      passed: !f.hasProductivity || f.hasMailboxBackup,
      fix: { label: "Add backup", href: "/app/marketplace#cat-protection" },
    },
    {
      key: "monitoring",
      title: f.hasThreatMonitoring ? "Threats watched around the clock" : "No one is watching for threats",
      points: 20,
      passed: f.hasThreatMonitoring,
      fix: { label: "Add threat monitoring", href: "/app/marketplace/managed-detection-response" },
    },
  ];
}

export function securityScore(checks: SecurityCheck[]): number {
  return checks.reduce((sum, c) => sum + (c.passed ? c.points : 0), 0);
}
