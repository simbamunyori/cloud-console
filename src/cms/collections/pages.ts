import type { CollectionConfig } from "payload";
import { PAGE_BLOCKS } from "../blocks";
import { image, text, textarea } from "../fields";
import { DEFAULT_LOCALE } from "../locales";
import { auditPublished, editorsWriteDrafts, publishingAccess } from "../publishing";

/**
 * The website's pages. Each market's words are a locale (Botswana's show
 * wherever a market has none of its own). Editors save drafts; only
 * Publishers publish, schedule, unpublish, restore and delete.
 */

/** Addresses the site already uses, which a page can't take. */
export const RESERVED_SLUGS = ["legal", "preview", "admin", "app", "media", "quote"];

/** Pages with their own address and extras: pricing shows the price tables under its sections. */
export const SPECIAL_SLUGS = ["home", "pricing", "security"];

/** "home" is the market's home page; any other slug is /<market>/<slug>. */
export const pagePath = (slug: string | null | undefined) => (!slug || slug === "home" ? "" : `/${slug}`);

/** Where the editor's preview goes: the page in the market being edited, in draft mode. */
const previewUrl = (slug: string | null | undefined, locale: string | undefined) =>
  `/preview?path=${encodeURIComponent(`/${locale || DEFAULT_LOCALE}${pagePath(slug)}`)}`;

export const Pages: CollectionConfig = {
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  admin: {
    useAsTitle: "title",
    group: "Website",
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
    description: "Each market's version is a language in the switcher at the top. A market without its own words shows Botswana's.",
    livePreview: {
      url: ({ data, locale }) => previewUrl(data?.slug, locale?.code),
      breakpoints: [
        { label: "Phone", name: "phone", width: 390, height: 844 },
        { label: "Desktop", name: "desktop", width: 1440, height: 900 },
      ],
    },
    preview: (doc, { locale }) => previewUrl(doc?.slug as string, locale),
  },
  access: publishingAccess,
  versions: {
    drafts: { autosave: { interval: 1500 }, schedulePublish: true },
    maxPerDoc: 50,
  },
  fields: [
    text("title", { required: true, maxLength: 80, description: "The page's name in the editor, and its title unless the search title below says otherwise." }),
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { position: "sidebar", description: "home is the market's home page, pricing and security are those pages. Anything else becomes /<market>/<address>, e.g. about." },
      validate: (value: unknown) => {
        const v = String(value ?? "");
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) return "Lower-case letters, numbers and single dashes, e.g. about-us.";
        if (RESERVED_SLUGS.includes(v)) return `The site already uses /${v}. Choose another address.`;
        return true;
      },
    },
    {
      name: "style",
      label: "Page style",
      type: "select",
      defaultValue: "landing",
      admin: { position: "sidebar", description: "Landing: full-width sections. Document: one column of headings and text, like the Security page." },
      options: [
        { label: "Landing", value: "landing" },
        { label: "Document", value: "document" },
      ],
    },
    { name: "layout", label: "Sections", type: "blocks", localized: true, blocks: PAGE_BLOCKS },
    {
      name: "seo",
      label: "Search and sharing",
      type: "group",
      localized: true,
      fields: [
        text("title", { label: "Search title", maxLength: 70 }),
        textarea("description", { label: "Search description", maxLength: 170 }),
        { ...image("image", { label: "Share image (shown when the page is shared)" }) },
      ],
    },
  ],
  endpoints: [
    {
      // The catalogue picker's choices: categories and products from the console's catalogue.
      path: "/catalogue-options",
      method: "get",
      handler: async (req) => {
        if (!req.user) return Response.json({ error: "Sign in first." }, { status: 401 });
        const { catalogueOptions } = await import("@/server/cms/catalogue-options");
        return Response.json(await catalogueOptions());
      },
    },
  ],
  hooks: {
    beforeOperation: [editorsWriteDrafts],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        if (doc._status !== "published") return doc;
        const first = operation === "create" || previousDoc?._status !== "published";
        await auditPublished(req, "website.page-published", `${first ? "Published" : "Published changes to"} the page ${doc.title}`, { pageId: doc.id, slug: doc.slug });
        return doc;
      },
    ],
    afterOperation: [
      async ({ operation, result, req }) => {
        if (operation !== "restoreVersion") return result;
        const { websiteAudit } = await import("@/server/cms/audit");
        const doc = result as { id: string | number; title?: string; slug?: string };
        await websiteAudit(req.user as never, "website.page-restored", `Restored an earlier version of the page ${doc.title}`, { pageId: doc.id, slug: doc.slug });
        return result;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, "website.page-removed", `Removed the page ${doc.title}`, { pageId: doc.id, slug: doc.slug });
      },
    ],
  },
};
