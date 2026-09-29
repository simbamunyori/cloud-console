import { Forbidden, type PayloadRequest } from "payload";
import { canPublishWebsite } from "@/server/staff/access";

/**
 * Who may do what with website content, shared by pages, legal pages and
 * the header and footer. Editors save drafts; Publishers also publish,
 * unpublish, schedule, restore and delete. Visitors read what is published.
 */

type EditorUser = { websiteRole?: "EDITOR" | "PUBLISHER" | null } | null | undefined;

export const isPublisher = (req: PayloadRequest) => canPublishWebsite((req.user as EditorUser)?.websiteRole);

/** Access for content with drafts. The check on `_status` is what hides the Publish button from Editors. */
export const publishingAccess = {
  read: ({ req }: { req: PayloadRequest }) => (req.user ? true : { _status: { equals: "published" as const } }),
  create: ({ req, data }: { req: PayloadRequest; data?: { _status?: string } }) => Boolean(req.user) && (data?._status !== "published" || isPublisher(req)),
  update: ({ req, data }: { req: PayloadRequest; data?: { _status?: string } }) => Boolean(req.user) && (data?._status !== "published" || isPublisher(req)),
  delete: ({ req }: { req: PayloadRequest }) => isPublisher(req),
  readVersions: ({ req }: { req: PayloadRequest }) => Boolean(req.user),
};

/** Globals are read by every page, published or not in the editor's eyes; visitors get the published version. */
export const globalAccess = {
  read: () => true,
  update: publishingAccess.update,
  readVersions: publishingAccess.readVersions,
  readDrafts: ({ req }: { req: PayloadRequest }) => Boolean(req.user),
};

/**
 * Editors only ever write drafts: a write that isn't a draft changes the
 * live content (publish or unpublish). Restoring a version replaces the
 * content with it, so that is a Publisher's call too.
 */
export function editorsWriteDrafts<A>({ args, operation, req }: { args?: A; operation: string; req: PayloadRequest }): A {
  const a = (args ?? {}) as { overrideAccess?: boolean; draft?: boolean };
  if (!req.user || a.overrideAccess || isPublisher(req)) return args as A;
  if ((operation === "create" || operation === "update") && !a.draft) throw new Forbidden(req.t);
  if (operation === "restoreVersion") throw new Forbidden(req.t);
  return args as A;
}

/** Records a publish in the staff audit log. */
export async function auditPublished(req: PayloadRequest, action: string, summary: string, data: Record<string, unknown>) {
  const { websiteAudit } = await import("@/server/cms/audit");
  await websiteAudit(req.user as never, action, summary, { ...data, locale: req.locale });
}
