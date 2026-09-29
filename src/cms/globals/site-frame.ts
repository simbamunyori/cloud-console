import type { Field, GlobalConfig } from "payload";
import { icon, link, text, textarea } from "../fields";
import { auditPublished, editorsWriteDrafts, globalAccess } from "../publishing";

/**
 * The header's menu and the footer's links, for every public page. Each
 * market can have its own; a market without them uses Botswana's. The
 * footer's contact details (email, phone, hours, payment methods) are the
 * market's settings in the staff console.
 */

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
  versions: { drafts: { autosave: { interval: 1500 } }, max: 50 },
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
  versions: { drafts: { autosave: { interval: 1500 } }, max: 50 },
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
  ],
  hooks: { beforeOperation: [editorsWriteDrafts], afterChange: publishAudit("footer") },
};
