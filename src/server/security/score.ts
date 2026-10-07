import type { BackupHealth } from "@prisma/client";
import type { CheckKey, EmailReport } from "@/server/tools/email-check";

/**
 * The full security score (docs/STRATEGY_ROLLOUT.md, U4): real checks of
 * an organisation, each with a plain explanation, a fix and, where one
 * helps, the product that fixes it. Pure, so it is easy to test; the
 * facts are gathered in src/server/security/score-facts.ts. A check we
 * can't run yet (nothing connected) is "unknown" and doesn't count.
 */

export type ScoreStatus = "pass" | "warn" | "fail" | "unknown";
export type ScoreGroup = "email" | "sign-in" | "backup" | "devices" | "workspace" | "team";

export const GROUP_LABEL: Record<ScoreGroup, string> = {
  email: "Email domain",
  "sign-in": "Signing in",
  backup: "Backup",
  devices: "Devices",
  workspace: "Microsoft 365 or Google Workspace",
  team: "Your team",
};

export interface ScoreCheck {
  key: string;
  group: ScoreGroup;
  title: string;
  /** What we found, in plain words. */
  explanation: string;
  status: ScoreStatus;
  points: number;
  /** What to do when it hasn't passed, and where. */
  fix?: { label: string; href: string };
  /** The product that fixes it, offered in one click. */
  product?: { slug: string; quantity?: number };
}

export interface ServiceToBackUp {
  name: string;
  kind: "microsoft" | "google" | "server";
  backup: { health: BackupHealth; lastSuccessAt: Date | null } | null;
}

export interface ScoreFacts {
  emailDomain: string | null;
  email: Pick<EmailReport, "checks" | "provider"> | null;
  members: number;
  withoutTwoStep: number;
  inactiveMembers: number;
  admins: number;
  services: ServiceToBackUp[];
  hasThreatMonitoring: boolean;
  /** From the security provider (U5); null until it reports. */
  devices: { protected: number; total: number } | null;
  /** From Microsoft 365 or Google Workspace (U6); null until connected. */
  workspace: { failing: string[]; total: number } | null;
  /** A Microsoft 365 or Google Workspace tenant we don't have admin access to yet (U6). */
  workspaceNeedsAccess?: boolean;
  now: Date;
}

export const MAX_ADMINS = 3;
/** A backup older than this is stale. */
export const STALE_BACKUP_DAYS = 3;
const BACKUP_POINTS = 20;

const EMAIL: { key: CheckKey; points: number; product?: string }[] = [
  { key: "mx", points: 5, product: "business-email" },
  { key: "spf", points: 8, product: "managed-support" },
  { key: "dkim", points: 8, product: "managed-support" },
  { key: "dmarc", points: 8, product: "managed-support" },
  { key: "certificate", points: 5, product: "ssl-certificate" },
];

const BACKUP_PRODUCT: Record<ServiceToBackUp["kind"], string> = { microsoft: "backup-microsoft-365", google: "backup-google-workspace", server: "server-backup" };

const SCORE_PAGE = "/app/security/score";

function emailChecks(f: ScoreFacts): ScoreCheck[] {
  if (!f.emailDomain)
    return [
      {
        key: "email-domain",
        group: "email",
        title: "Tell us your email domain",
        explanation: "We check the domain your email comes from for the settings that stop others sending as you.",
        status: "unknown",
        points: 0,
        fix: { label: "Add your domain", href: `${SCORE_PAGE}#email-domain` },
      },
    ];
  return EMAIL.map(({ key, points, product }) => {
    const c = f.email?.checks.find((x) => x.key === key);
    const status: ScoreStatus = c ? c.status : "unknown";
    return {
      key: `email-${key}`,
      group: "email" as const,
      title: c?.title ?? key.toUpperCase(),
      explanation: c ? (c.fix ? `${c.finding} ${c.fix}` : c.finding) : `Not checked yet for ${f.emailDomain}.`,
      status,
      points,
      ...(status === "fail" || status === "warn"
        ? {
            fix: { label: "Ask us to fix it", href: "/app/support/new" },
            // Only a mail service fixes missing mail servers; the records are a support job.
            ...(product && (key !== "mx" || status === "fail") ? { product: { slug: product } } : {}),
          }
        : {}),
    };
  });
}

function backupChecks(f: ScoreFacts): ScoreCheck[] {
  if (!f.services.length) return [];
  const each = Math.max(1, Math.round(BACKUP_POINTS / f.services.length));
  return f.services.map((s, i) => {
    const b = s.backup;
    const ageDays = b?.lastSuccessAt ? (f.now.getTime() - b.lastSuccessAt.getTime()) / 86_400_000 : null;
    let status: ScoreStatus;
    let explanation: string;
    if (!b) {
      status = "fail";
      explanation = `${s.name} has no backup. If something is deleted or encrypted by ransomware, it can't be brought back.`;
    } else if (b.health === "PENDING") {
      status = "warn";
      explanation = `${s.name}'s backup is being set up.`;
    } else if (b.health === "FAILED") {
      status = "fail";
      explanation = `${s.name}'s last backup failed. Our team has been told.`;
    } else if (b.health === "WARNING" || ageDays === null || ageDays > STALE_BACKUP_DAYS) {
      status = "warn";
      explanation = ageDays === null ? `${s.name}'s backup has no good copy yet.` : `${s.name}'s last good copy is ${Math.floor(ageDays)} days old.`;
    } else {
      status = "pass";
      explanation = `${s.name} is backed up off-site.`;
    }
    return {
      key: `backup-${i}`,
      group: "backup" as const,
      title: status === "pass" ? `${s.name} backed up` : !b ? `${s.name} isn't backed up` : `${s.name} backup needs attention`,
      explanation,
      status,
      points: each,
      ...(!b ? { product: { slug: BACKUP_PRODUCT[s.kind] }, fix: { label: "Add backup", href: "/app/marketplace#cat-protection" } } : status !== "pass" ? { fix: { label: "See your backups", href: "/app/backup" } } : {}),
    };
  });
}

export function scoreChecks(f: ScoreFacts): ScoreCheck[] {
  const devices: ScoreCheck = f.devices
    ? {
        key: "devices",
        group: "devices",
        title: f.devices.protected === f.devices.total ? "Every device is protected" : `${f.devices.total - f.devices.protected} of ${f.devices.total} devices aren't protected`,
        explanation: "Devices without protection are the usual way in for ransomware.",
        status: f.devices.protected === f.devices.total ? "pass" : f.devices.protected > 0 ? "warn" : "fail",
        points: 15,
        ...(f.devices.protected < f.devices.total ? { product: { slug: "managed-detection-response", quantity: f.devices.total - f.devices.protected } } : {}),
      }
    : {
        key: "devices",
        group: "devices",
        title: "Device protection isn't reporting yet",
        explanation: "Once your devices are protected and monitored by us, how many are covered shows here.",
        status: "unknown",
        points: 0,
        product: { slug: "managed-detection-response" },
      };
  const workspace: ScoreCheck = f.workspace
    ? {
        key: "workspace",
        group: "workspace",
        title: f.workspace.failing.length ? `${f.workspace.failing.length} of ${f.workspace.total} settings need changing` : "Security settings are on",
        explanation: f.workspace.failing.length ? `Not on yet: ${f.workspace.failing.join("; ")}.` : "The recommended security settings are on.",
        status: f.workspace.failing.length === 0 ? "pass" : f.workspace.failing.length * 2 > f.workspace.total ? "fail" : "warn",
        points: 10,
        ...(f.workspace.failing.length ? { fix: { label: "Ask us to fix it", href: "/app/support/new" } } : {}),
      }
    : {
        key: "workspace",
        group: "workspace",
        title: "Settings not checked yet",
        explanation: f.workspaceNeedsAccess
          ? "Give us admin access to your Microsoft 365 or Google Workspace and we check its security settings here."
          : "Once your Microsoft 365 or Google Workspace is connected, we check its security settings here.",
        status: "unknown",
        points: 0,
        ...(f.workspaceNeedsAccess ? { fix: { label: "Give us access", href: "/app/licences" } } : {}),
      };
  return [
    ...emailChecks(f),
    {
      key: "two-step",
      group: "sign-in",
      title: f.withoutTwoStep ? `${f.withoutTwoStep} ${f.withoutTwoStep === 1 ? "person hasn't" : "people haven't"} finished two-step login` : "Two-step login for everyone",
      explanation: `${f.members - f.withoutTwoStep} of ${f.members} people on your console team sign in with two steps.`,
      status: f.withoutTwoStep === 0 ? "pass" : "fail",
      points: 20,
      ...(f.withoutTwoStep ? { fix: { label: "Review your team", href: "/app/team" } } : {}),
    },
    ...backupChecks(f),
    devices,
    workspace,
    {
      key: "monitoring",
      group: "devices",
      title: f.hasThreatMonitoring ? "Threats watched around the clock" : "No one is watching for threats",
      explanation: f.hasThreatMonitoring ? "Our security operations centre watches for attacks day and night." : "An attack at night or over a weekend can run for days before anyone notices.",
      status: f.hasThreatMonitoring ? "pass" : "fail",
      points: 10,
      ...(f.hasThreatMonitoring ? {} : { product: { slug: "managed-detection-response" } }),
    },
    {
      key: "inactive",
      group: "team",
      title: f.inactiveMembers ? `${f.inactiveMembers} ${f.inactiveMembers === 1 ? "person hasn't" : "people haven't"} signed in for 90 days` : "Everyone on the team is active",
      explanation: "Old accounts are easy to forget and easy to misuse.",
      status: f.inactiveMembers === 0 ? "pass" : "warn",
      points: 8,
      ...(f.inactiveMembers ? { fix: { label: "Remove old accounts", href: "/app/team" } } : {}),
    },
    {
      key: "admins",
      group: "team",
      title: f.admins > MAX_ADMINS ? `${f.admins} owners and admins` : "Few people can change the team",
      explanation: `Keep owners and admins to ${MAX_ADMINS} or fewer, so fewer accounts can order or change who has access.`,
      status: f.admins <= MAX_ADMINS ? "pass" : "warn",
      points: 5,
      ...(f.admins > MAX_ADMINS ? { fix: { label: "Review roles", href: "/app/team" } } : {}),
    },
  ];
}

/** 0 to 100: each check that could run counts by its points; a warning counts half. */
export function fullScore(checks: ScoreCheck[]): number {
  const counted = checks.filter((c) => c.status !== "unknown" && c.points > 0);
  const total = counted.reduce((n, c) => n + c.points, 0);
  if (!total) return 0;
  const got = counted.reduce((n, c) => n + (c.status === "pass" ? c.points : c.status === "warn" ? c.points / 2 : 0), 0);
  return Math.round((got / total) * 100);
}

/** For Home's score card: the checks that count, each worth its share of 100, and a fix on every one. */
export function homeChecks(checks: ScoreCheck[]) {
  const counted = checks.filter((c) => c.status !== "unknown" && c.points > 0);
  const total = counted.reduce((n, c) => n + c.points, 0) || 1;
  return counted.map((c) => ({
    key: c.key,
    title: c.title,
    points: Math.round((c.points / total) * 100),
    passed: c.status === "pass",
    fix: c.fix ?? { label: "See how to fix it", href: "/app/security/score" },
  }));
}

export const SCORE_WORD = (score: number) => (score >= 80 ? "Strong" : score >= 50 ? "Fair" : "At risk");
export const STATUS_LABEL: Record<ScoreStatus, string> = { pass: "Good", warn: "Needs attention", fail: "Fix this", unknown: "Not checked yet" };
