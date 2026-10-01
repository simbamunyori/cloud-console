import type { Field, GlobalConfig } from "payload";
import { catalogue } from "../blocks";
import { link, text, textarea } from "../fields";
import { auditPublished, editorsWriteDrafts, globalAccess } from "../publishing";

/**
 * The header's menu and the footer's links, contact details and social
 * links, for every public page. Each market can have its own; a market
 * without them uses Botswana's. A contact detail left empty is the
 * market's own setting in the staff console (email, phone and hours);
 * payment methods always are.
 */

/** A web address on one of the given sites, or nothing. */
const siteUrl =
  (hosts: string[], example: string) =>
  (value: unknown): true | string => {
    if (!value) return true;
    try {
      const u = new URL(String(value));
      const host = u.hostname.replace(/^www\./, "");
      if (u.protocol === "https:" && hosts.some((h) => host === h || host.endsWith(`.${h}`))) return true;
    } catch {
      // Falls through to the message.
    }
    return `Paste the full address, e.g. ${example}`;
  };

const PHONE = /^\+?[0-9][0-9 ]{5,19}$/;
const phone = (value: unknown): true | string => (!value || PHONE.test(String(value).trim()) ? true : "A phone number in international form, e.g. +267 390 0000.");
const email = (value: unknown): true | string => (!value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)) ? true : "An email address, e.g. support@fourthgeneration.technology.");

const links = (name: string, label: string, max: number, localized = false): Field => ({
  name,
  label,
  type: "array",
  localized,
  maxRows: max,
  fields: [link("link", "Link", { required: true })],
});

const publishAudit =
  (what: string): NonNullable<GlobalConfig["hooks"]>["afterChange"] =>
  [
    async ({ doc, req }) => {
      if (doc._status === "published") await auditPublished(req, "website.frame-published", `Published the ${what}`, { global: what });
      return doc;
    },
  ];

/** A menu link: its words, a one-line description, and optionally the products it is about. */
const menuLink: Field = {
  name: "links",
  type: "array",
  maxRows: 8,
  fields: [
    link("link", "Link", { required: true }),
    text("description", { label: "One line under the link", maxLength: 90 }),
    {
      ...catalogue("products", "Only while these are on sale"),
      admin: {
        description: "Optional. Tick the products the link is about: it shows only while one of them is live and priced in the market.",
        components: { Field: "@/cms/components/catalogue-picker#CataloguePicker" },
      },
    } as Field,
  ],
};

export const FEATURES = [
  { label: "Domain search box", value: "domainSearch" },
  { label: "Partner badge (from Partners and accreditations)", value: "partnerBadge" },
  { label: "Website example (Mothibi Attorneys)", value: "websitePreview" },
  { label: "Thebe screen with its buttons", value: "thebe" },
  { label: "Support hours and phone", value: "support" },
  { label: "A short note with a link", value: "note" },
] as const;

export const Header: GlobalConfig = {
  slug: "header",
  label: "Header",
  admin: { group: "Website", description: "The menus at the top of every public page. Each menu opens full width on wide screens and as a list on phones." },
  access: globalAccess,
  versions: { drafts: { autosave: { interval: 1500 }, schedulePublish: true }, max: 50 },
  fields: [
    {
      name: "menus",
      type: "array",
      localized: true,
      maxRows: 8,
      admin: { description: "In the order they appear. A menu with no links showing in a market is left out there." },
      fields: [
        text("label", { required: true, maxLength: 30 }),
        { name: "right", label: "Show at the right, beside Get started", type: "checkbox", defaultValue: false },
        {
          name: "columns",
          type: "array",
          minRows: 1,
          maxRows: 3,
          fields: [text("heading", { maxLength: 40, description: "Optional." }), menuLink],
        },
        {
          name: "feature",
          label: "Feature area",
          type: "group",
          fields: [
            { name: "kind", label: "Shows", type: "select", options: FEATURES.map((f) => ({ ...f })), admin: { description: "Optional. Each kind hides itself when it has nothing approved to show." } },
            text("heading", { maxLength: 60 }),
            textarea("text", { maxLength: 200 }),
            link("link", "Link"),
          ],
        },
      ],
    },
    { ...menuLink, label: "Links beside the menus", maxRows: 3, localized: true, admin: { description: "Plain links after the menus, e.g. Plans. A link about products shows only while one of them is on sale." } } as Field,
  ],
  hooks: { beforeOperation: [editorsWriteDrafts], afterChange: publishAudit("header") },
};

export const Footer: GlobalConfig = {
  slug: "footer",
  label: "Footer",
  admin: { group: "Website", description: "The links and words at the bottom of every public page." },
  access: globalAccess,
  versions: { drafts: { autosave: { interval: 1500 }, schedulePublish: true }, max: 50 },
  fields: [
    {
      name: "newsletter",
      label: "Newsletter sign-up",
      type: "group",
      localized: true,
      admin: { description: "The sign-up across the top of the footer. It hides when the heading is empty." },
      fields: [text("heading", { maxLength: 80 }), textarea("text", { label: "Line under the heading", maxLength: 200 })],
    },
    { ...textarea("tagline", { maxLength: 160, description: "Under the logo. A second line is fine, e.g. Looking after businesses since 2014." }), localized: true },
    {
      name: "columns",
      type: "array",
      localized: true,
      maxRows: 4,
      fields: [text("heading", { required: true, maxLength: 40 }), links("links", "Links", 8)],
    },
    {
      name: "contact",
      label: "Contact details",
      type: "group",
      localized: true,
      admin: { description: "Leave email, phone or hours empty to use the market's own settings in the staff console. Anything else left empty stays hidden." },
      fields: [
        { name: "email", type: "email", validate: email } as Field,
        { name: "phone", type: "text", validate: phone } as Field,
        { name: "whatsapp", label: "WhatsApp number", type: "text", validate: phone, admin: { description: "Shows a WhatsApp link with the social links." } } as Field,
        text("hours", { label: "Support hours", maxLength: 80 }),
        textarea("address", { label: "Office address", maxLength: 200 }),
      ],
    },
    {
      name: "social",
      label: "Social links",
      type: "group",
      localized: true,
      admin: { description: "Each shows only when it has an address." },
      fields: [
        { name: "linkedin", label: "LinkedIn page", type: "text", validate: siteUrl(["linkedin.com"], "https://www.linkedin.com/company/your-company") } as Field,
        { name: "facebook", label: "Facebook page", type: "text", validate: siteUrl(["facebook.com"], "https://www.facebook.com/your-page") } as Field,
      ],
    },
  ],
  hooks: { beforeOperation: [editorsWriteDrafts], afterChange: publishAudit("footer") },
};
