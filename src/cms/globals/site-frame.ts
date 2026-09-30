import type { Field, GlobalConfig } from "payload";
import { icon, link, text, textarea } from "../fields";
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

export const Header: GlobalConfig = {
  slug: "header",
  label: "Header",
  admin: { group: "Website", description: "The menu at the top of every public page." },
  access: globalAccess,
  versions: { drafts: { autosave: { interval: 1500 }, schedulePublish: true }, max: 50 },
  fields: [
    {
      name: "groups",
      label: "Services menu",
      type: "array",
      localized: true,
      maxRows: 5,
      admin: { description: "The five service families in the Services menu. The first link is where a phone's menu goes." },
      fields: [icon, text("title", { required: true, maxLength: 40 }), text("blurb", { maxLength: 80 }), links("links", "Links", 4)],
    },
    { ...text("menuNote", { label: "Line under the Services menu", maxLength: 100 }), localized: true },
    { ...link("menuLink", "Link under the Services menu"), localized: true } as Field,
    links("pages", "Pages beside the menu", 4, true),
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
    { ...textarea("tagline", { maxLength: 160 }), localized: true },
    {
      name: "columns",
      type: "array",
      localized: true,
      maxRows: 3,
      fields: [text("heading", { required: true, maxLength: 40 }), links("links", "Links", 8)],
    },
    { ...text("contactHeading", { label: "Heading over the contact details", maxLength: 40 }), localized: true },
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
