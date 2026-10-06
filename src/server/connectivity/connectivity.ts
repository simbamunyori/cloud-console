import type { Prisma, PrismaClient } from "@prisma/client";
import { parseDateOnly } from "@/lib/dates";
import { featureOn } from "@/server/features/features";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Connectivity groundwork (docs/STRATEGY_ROLLOUT.md, U12). The Connect
 * products and bundles wait in the catalogue as drafts, sold by quote.
 * Nothing about them reaches the public or customers until the licence
 * for a market is recorded here and an Admin switches on "Connectivity"
 * in Features; even then, only in markets with a licence.
 */

export const CONNECTIVITY_FAMILY = "connectivity";

/** What a quote request can ask for, in plain words the staff and customer both read. */
export const SPEEDS = [
  { value: "up-to-50", label: "Up to 50 Mbps" },
  { value: "50-200", label: "50 to 200 Mbps" },
  { value: "200-1000", label: "200 Mbps to 1 Gbps" },
  { value: "over-1000", label: "More than 1 Gbps" },
  { value: "not-sure", label: "Not sure, advise me" },
];
export const MAX_SITES = 20;

type LicenceDb = Pick<PrismaClient, "featureSwitch" | "connectivityLicence">;

/** Whether connectivity may be offered in this market: switched on, and licensed there. */
export async function connectivityOffered(db: LicenceDb, market: string): Promise<boolean> {
  if (!(await featureOn(db, "connectivity"))) return false;
  return Boolean(await db.connectivityLicence.findUnique({ where: { market }, select: { market: true } }));
}

export async function connectivityLicences(db: PrismaClient) {
  const [markets, licences] = await Promise.all([
    db.market.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true, name: true, enabled: true } }),
    db.connectivityLicence.findMany(),
  ]);
  return markets.map((m) => ({ ...m, licence: licences.find((l) => l.market === m.code) ?? null }));
}

/** Admins record, change or remove the licence for a market. Removing the last one switches connectivity off. */
export async function saveLicence(deps: { db: PrismaClient; staff: StaffActor }, market: string, input: { regulator: string; reference: string; grantedOn: string; remove?: boolean }) {
  assertStaffCan(deps.staff, "manageCompany");
  const row = await deps.db.market.findUnique({ where: { code: market }, select: { code: true, name: true } });
  if (!row) throw new DomainError("not-found", "No such market.");
  if (input.remove) {
    await deps.db.$transaction(async (tx) => {
      const removed = await tx.connectivityLicence.deleteMany({ where: { market } });
      if (!removed.count) return;
      await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "connectivity.licence-removed", summary: `Removed the connectivity licence for ${row.name}`, data: { market } } });
      if (!(await tx.connectivityLicence.count())) {
        const off = await tx.featureSwitch.updateMany({ where: { key: "connectivity", enabled: true }, data: { enabled: false, updatedById: deps.staff.userId, updatedBy: deps.staff.name } });
        if (off.count) await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "feature.off", summary: "Switched Connectivity off: no market has a licence", data: { key: "connectivity" } } });
      }
    });
    return;
  }
  const fieldErrors: Record<string, string> = {};
  const regulator = input.regulator.trim();
  const reference = input.reference.trim();
  const grantedOn = parseDateOnly(input.grantedOn.trim());
  if (!regulator || regulator.length > 80) fieldErrors.regulator = "Enter who granted it, such as BOCRA.";
  if (!reference || reference.length > 120) fieldErrors.reference = "Enter the licence number.";
  if (!grantedOn) fieldErrors.grantedOn = "Enter the date it was granted.";
  else if (grantedOn.getTime() > Date.now()) fieldErrors.grantedOn = "Enter a date that has passed.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const data = { regulator, reference, grantedOn: grantedOn!, updatedById: deps.staff.userId };
  await deps.db.$transaction(async (tx) => {
    await tx.connectivityLicence.upsert({ where: { market }, update: data, create: { market, ...data } });
    await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "connectivity.licence-saved", summary: `Recorded the connectivity licence for ${row.name}: ${regulator} ${reference}`, data: { market } } });
  });
}

export interface ConnectRequestInput {
  sites: string;
  speed: string;
  standby: boolean;
  cloudLink: boolean;
  managed: boolean;
  startBy: string;
}

export interface ConnectRequest {
  sites: { place: string; address: string }[];
  speed: string;
  standby: boolean;
  cloudLink: boolean;
  managed: boolean;
  startBy: Date | null;
}

/** Checks the extra questions on a connectivity quote request. One site per line: "Town, address". */
export function parseConnectRequest(input: ConnectRequestInput, now = new Date()): ConnectRequest {
  const fieldErrors: Record<string, string> = {};
  const sites = input.sites
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [place, ...rest] = line.split(",");
      return { place: place.trim().slice(0, 80), address: rest.join(",").trim().slice(0, 200) };
    });
  if (!sites.length) fieldErrors.sites = "Enter at least one site: the town, then the address.";
  else if (sites.length > MAX_SITES) fieldErrors.sites = `List up to ${MAX_SITES} sites here, and the rest in the box below.`;
  else if (sites.some((s) => !s.place)) fieldErrors.sites = "Start each line with the town.";
  if (!SPEEDS.some((s) => s.value === input.speed)) fieldErrors.speed = "Choose a speed, or Not sure.";
  const startBy = input.startBy.trim() ? parseDateOnly(input.startBy.trim()) : null;
  if (input.startBy.trim() && !startBy) fieldErrors.startBy = "Enter a date.";
  else if (startBy && startBy.getTime() < now.getTime() - 86_400_000) fieldErrors.startBy = "Enter a date from today on.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  return { sites, speed: input.speed, standby: input.standby, cloudLink: input.cloudLink, managed: input.managed, startBy };
}

/** The request in words, added to the quote's own text so every quote screen and email shows it. */
export function describeConnectRequest(r: ConnectRequest): string {
  const speed = SPEEDS.find((s) => s.value === r.speed)?.label ?? r.speed;
  return [
    `Connectivity for ${r.sites.length} ${r.sites.length === 1 ? "site" : "sites"}:`,
    ...r.sites.map((s) => `- ${s.place}${s.address ? `, ${s.address}` : ""}`),
    `Speed: ${speed}.`,
    r.standby ? "Wants a standby link that takes over if the main one fails." : null,
    r.cloudLink ? "Wants a private link to our servers or Microsoft Azure." : null,
    r.managed ? "Interested in a bundle with managed security and support." : null,
    r.startBy ? `Needed by ${r.startBy.toISOString().slice(0, 10)}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** In the quote's transaction. */
export async function recordConnectRequest(tx: Pick<Prisma.TransactionClient, "connectivityRequest">, quoteId: string, r: ConnectRequest) {
  await tx.connectivityRequest.create({ data: { quoteId, sites: r.sites, speed: r.speed, standby: r.standby, cloudLink: r.cloudLink, managed: r.managed, startBy: r.startBy } });
}

/** Whether a product belongs to the Connectivity family, so its quote form asks the connectivity questions. */
export async function isConnectProduct(db: Pick<PrismaClient, "product">, slug: string | undefined | null) {
  if (!slug) return false;
  const p = await db.product.findUnique({ where: { slug }, select: { category: { select: { familyKey: true } } } });
  return p?.category.familyKey === CONNECTIVITY_FAMILY;
}
