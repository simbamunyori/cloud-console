import {
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import type { CollectionConfig, Field } from "payload";
import { image, richText, text, textarea } from "../fields";
import { auditPublished, editorsWriteDrafts, isPublisher, publishingAccess } from "../publishing";
import { TOKENS_HELP } from "../tokens";

/**
 * Legal pages: terms, privacy, refunds, service providers and data
 * protection. Each market writes its own; a market without its own text
 * never borrows another market's (legal text is per country). A page
 * shows the "DRAFT FOR LEGAL REVIEW" banner until a Publisher ticks
 * "Approved by legal", which is recorded in the staff audit log.
 */

export const LEGAL_KINDS = [
  { value: "terms", label: "Terms of service" },
  { value: "privacy", label: "Privacy notice" },
  { value: "refunds", label: "Refunds and cancellations" },
  { value: "service-providers", label: "Service providers" },
  { value: "data-protection", label: "Data protection" },
] as const;

export type LegalKindValue = (typeof LEGAL_KINDS)[number]["value"];

const publisherOnly = ({ req }: { req: Parameters<typeof isPublisher>[0] }) => isPublisher(req);

export const Legal: CollectionConfig = {
  slug: "legal",
  labels: { singular: "Legal page", plural: "Legal pages" },
  admin: {
    useAsTitle: "title",
    group: "Website",
    defaultColumns: ["title", "kind", "approvedByLegal", "_status", "updatedAt"],
    description: "Each market's text is a language in the switcher at the top. A market without its own text shows a note that it is on its way, never another market's.",
    livePreview: {
      url: ({ data, locale }) => `/preview?path=${encodeURIComponent(`/${locale?.code ?? "bw"}${data?.kind === "data-protection" ? "/security" : `/legal/${data?.kind ?? ""}`}`)}`,
      breakpoints: [
        { label: "Phone", name: "phone", width: 390, height: 844 },
        { label: "Desktop", name: "desktop", width: 1440, height: 900 },
      ],
    },
  },
  access: publishingAccess,
  versions: { drafts: { autosave: { interval: 1500 }, schedulePublish: true }, maxPerDoc: 50 },
  fields: [
    {
      name: "kind",
      type: "select",
      required: true,
      unique: true,
      options: LEGAL_KINDS.map((k) => ({ label: k.label, value: k.value })),
      admin: { position: "sidebar", description: "Data protection shows on the Security page." },
    },
    { ...text("title", { required: true, maxLength: 120 }), localized: true },
    { ...text("updated", { label: "Last updated line", maxLength: 80, description: "e.g. Last updated: 29 September 2026" }), localized: true },
    {
      ...text("draftNotice", { label: "Draft banner", maxLength: 200, description: "Shown at the top until the text is approved by legal." }),
      localized: true,
      defaultValue: "DRAFT FOR LEGAL REVIEW. Not in force until approved by an attorney.",
    },
    {
      name: "approvedByLegal",
      label: "Approved by legal",
      type: "checkbox",
      localized: true,
      defaultValue: false,
      access: { create: publisherOnly, update: publisherOnly },
      admin: { position: "sidebar", description: "Only a Publisher can tick this, once a lawyer has approved this market's text. It removes the draft banner when published." },
    },
    {
      ...(richText("body", { required: true }) as Field & { type: "richText" }),
      localized: true,
      admin: { description: TOKENS_HELP },
      editor: lexicalEditor({
        features: () => [
          ParagraphFeature(),
          HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
          BoldFeature(),
          ItalicFeature(),
          LinkFeature({ enabledCollections: [] }),
          UnorderedListFeature(),
          OrderedListFeature(),
          EXPERIMENTAL_TableFeature(),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    } as Field,
    {
      name: "seo",
      label: "Search and sharing",
      type: "group",
      localized: true,
      fields: [text("title", { label: "Search title", maxLength: 70 }), textarea("description", { label: "Search description", maxLength: 170 }), image("image", { label: "Share image" })],
    },
  ],
  hooks: {
    beforeOperation: [editorsWriteDrafts],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (doc._status !== "published") return doc;
        const data = { legalId: doc.id, kind: doc.kind };
        if (Boolean(doc.approvedByLegal) !== Boolean(previousDoc?._status === "published" && previousDoc?.approvedByLegal)) {
          await auditPublished(req, doc.approvedByLegal ? "website.legal-approved" : "website.legal-approval-withdrawn", `${doc.approvedByLegal ? "Marked as approved by legal" : "Withdrew legal approval of"}: ${doc.title} (${req.locale})`, data);
        }
        await auditPublished(req, "website.legal-published", `Published the legal page ${doc.title} (${req.locale})`, data);
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, "website.legal-removed", `Removed the legal page ${doc.title}`, { legalId: doc.id, kind: doc.kind });
      },
    ],
  },
};
