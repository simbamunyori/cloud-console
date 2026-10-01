import "server-only";
import type { PrismaClient, WebsiteRole } from "@prisma/client";
import { roleOfPath } from "@/lib/net/hosts";
import { DomainError } from "@/server/org/access";
import { forgetRedirects, normalisePath } from "@/server/site/redirects";
import { canPublishWebsite, staffLabel, type StaffActor } from "@/server/staff/access";

/**
 * Old website addresses (Milestone 10), kept by website Publishers in the
 * staff console. Each change is in the staff audit log.
 */

type Actor = StaffActor & { websiteRole: WebsiteRole | null };
type Db = Pick<PrismaClient, "siteRedirect" | "staffAuditEvent" | "$transaction">;

function mustPublish(actor: Actor) {
  if (!canPublishWebsite(actor.websiteRole)) throw new DomainError("forbidden", "Only a website Publisher can change where old addresses go.");
}

/** Where a redirect may point: a page on this site, by its path. */
function cleanTarget(value: string): string {
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || /\s/.test(v)) throw new DomainError("invalid", "Enter a path on this site, starting with /, for example /bw/pricing.", "toPath");
  return v;
}

/** An old address that isn't one of the new site's or the console's own. */
function cleanSource(value: string, markets: string[]): string {
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || /\s/.test(v) || v.includes("?")) throw new DomainError("invalid", "Enter the old path, starting with /, without the domain or a ?.", "fromPath");
  const p = normalisePath(v);
  const first = p.split("/")[1] ?? "";
  if (p === "/" || roleOfPath(p) !== "site" || markets.includes(first)) throw new DomainError("invalid", "That address is in use on the new site, so it can't be sent elsewhere.", "fromPath");
  return p;
}

export async function listRedirects(db: Pick<PrismaClient, "siteRedirect">) {
  return db.siteRedirect.findMany({ orderBy: [{ fromPath: "asc" }] });
}

export async function saveRedirect(db: Db, actor: Actor, values: { fromPath: string; toPath: string }, markets: string[]) {
  mustPublish(actor);
  const fromPath = cleanSource(values.fromPath, markets);
  const toPath = cleanTarget(values.toPath);
  if (normalisePath(toPath) === fromPath) throw new DomainError("invalid", "An address can't send visitors to itself.", "toPath");
  const row = await db.$transaction(async (tx) => {
    const saved = await tx.siteRedirect.upsert({
      where: { fromPath },
      create: { fromPath, toPath, createdById: actor.userId, createdBy: staffLabel(actor) },
      update: { toPath },
    });
    await tx.staffAuditEvent.create({ data: { actorUserId: actor.userId, actorLabel: staffLabel(actor), action: "redirect.saved", summary: `Old address ${fromPath} now goes to ${toPath}` } });
    return saved;
  });
  forgetRedirects();
  return row;
}

export async function removeRedirect(db: Db, actor: Actor, id: string) {
  mustPublish(actor);
  await db.$transaction(async (tx) => {
    const row = await tx.siteRedirect.findUnique({ where: { id } });
    if (!row) throw new DomainError("not-found", "That address isn't on the list any more.");
    await tx.siteRedirect.delete({ where: { id } });
    await tx.staffAuditEvent.create({ data: { actorUserId: actor.userId, actorLabel: staffLabel(actor), action: "redirect.removed", summary: `Old address ${row.fromPath} no longer goes to ${row.toPath}` } });
  });
  forgetRedirects();
}
