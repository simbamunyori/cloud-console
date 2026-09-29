import type { CollectionConfig } from "payload";
import { canPublishWebsite } from "@/server/staff/access";
import { mediaDir, mediaUrl } from "../media-dir";

type Sizes = Record<string, { filename?: string | null; url?: string | null }> | undefined;

/**
 * Images for the website. Each upload is resized to set widths, as WebP,
 * and can't be saved without alt text.
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Image", plural: "Media library" },
  admin: { useAsTitle: "alt", group: "Website", defaultColumns: ["filename", "alt", "updatedAt"] },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    // Removing an image can break a published page, so only Publishers may.
    delete: ({ req }) => canPublishWebsite(req.user?.websiteRole),
  },
  upload: {
    staticDir: mediaDir(),
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/avif"],
    imageSizes: [
      { name: "thumbnail", width: 400, formatOptions: { format: "webp", options: { quality: 80 } } },
      { name: "medium", width: 960, formatOptions: { format: "webp", options: { quality: 80 } } },
      { name: "large", width: 1920, withoutEnlargement: true, formatOptions: { format: "webp", options: { quality: 80 } } },
      // Share images for social sites: 1200 x 630.
      { name: "share", width: 1200, height: 630, position: "centre", formatOptions: { format: "jpeg", options: { quality: 85 } } },
    ],
    adminThumbnail: "thumbnail",
    focalPoint: true,
  },
  fields: [
    {
      name: "alt",
      label: "Alt text",
      type: "text",
      required: true,
      admin: { description: "What the image shows, for people who can't see it. Describe it in a short sentence." },
      validate: (value: string | null | undefined) => ((value ?? "").trim().length >= 3 ? true : "Describe the image in a few words."),
    },
  ],
  hooks: {
    afterRead: [
      ({ doc }) => {
        if (doc.filename) doc.url = mediaUrl(doc.filename);
        for (const size of Object.values((doc.sizes as Sizes) ?? {})) if (size?.filename) size.url = mediaUrl(size.filename);
        return doc;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user, operation === "create" ? "website.media-added" : "website.media-changed", `${operation === "create" ? "Added" : "Changed"} the image ${doc.filename}`, { mediaId: doc.id });
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user, "website.media-removed", `Removed the image ${doc.filename}`, { mediaId: doc.id });
      },
    ],
  },
};
