import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, Field, FieldAccess } from "payload";
import { image, text, textarea } from "../fields";
import { MARKET_LOCALES } from "../locales";
import { isPublisher } from "../publishing";

/**
 * Proof shown on the public site (docs/FINAL_BUILD.md, Milestone 4):
 * partners, client logos, numbers, the team, testimonials and client
 * websites. Each list is dragged into order in the editor and can be
 * limited to some markets. Nothing shows until it is approved: the
 * approval and permission boxes are ticked by Publishers only, and every
 * change is written to the staff audit log.
 */

const markets: Field = {
  name: "markets",
  type: "select",
  hasMany: true,
  options: MARKET_LOCALES.map((l) => ({ label: l.label, value: l.code })),
  admin: { position: "sidebar", description: "Leave empty to show it in every market." },
};

/** Only Publishers may tick or untick an approval, since it puts something on the public site. */
const publishersOnly: { create: FieldAccess; update: FieldAccess } = { create: ({ req }) => isPublisher(req), update: ({ req }) => isPublisher(req) };

const approval = (name: string, label: string, description: string): Field => ({
  name,
  label,
  type: "checkbox",
  defaultValue: false,
  access: publishersOnly,
  admin: { position: "sidebar", description: `${description} Only Publishers can change this.` },
});

const url = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: "text",
  admin: description ? { description } : undefined,
  validate: (value: unknown) => (!value || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(String(value)) ? true : "Enter a full address starting with https://"),
});

function audited(slug: string, noun: string, title: (doc: Record<string, unknown>) => string): { afterChange: CollectionAfterChangeHook[]; afterDelete: CollectionAfterDeleteHook[] } {
  return {
    afterChange: [
      async ({ doc, operation, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, `website.${slug}-${operation === "create" ? "added" : "changed"}`, `${operation === "create" ? "Added" : "Changed"} the ${noun} ${title(doc)}`, {
          id: doc.id,
        });
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, `website.${slug}-removed`, `Removed the ${noun} ${title(doc)}`, { id: doc.id });
      },
    ],
  };
}

/** Any editor may read and change these; deleting is a Publisher's call. Visitors never read them directly: the site reads them on the server. */
const access = {
  read: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
  create: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
  update: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
  delete: ({ req }: { req: Parameters<typeof isPublisher>[0] }) => isPublisher(req),
};

const group = "Proof";

export const Partners: CollectionConfig = {
  slug: "partners",
  labels: { singular: "Partner or accreditation", plural: "Partners and accreditations" },
  orderable: true,
  admin: {
    useAsTitle: "name",
    group,
    defaultColumns: ["name", "badge", "approved", "markets"],
    description: "Shown on the home page, in the footer and in the Email menu once approved to display. Drag to reorder.",
  },
  access,
  fields: [
    text("name", { required: true, maxLength: 80, description: "e.g. Microsoft" }),
    text("badge", { label: "Badge wording", required: true, maxLength: 40, description: "The words on the badge, exactly as the partner allows, e.g. Microsoft partner." }),
    { ...image("logo", { label: "Official logo" }), admin: { description: "The partner's official logo, as a PNG or WebP. Without one the badge shows its wording." } } as Field,
    url("link", "Link", "Optional. The partner's page confirming the status, e.g. the partner directory entry."),
    {
      name: "feature",
      label: "Also shown",
      type: "select",
      options: [{ label: "In the Email and Microsoft 365 section and the Email menu", value: "email" }],
      admin: { description: "Optional. The first approved partner marked for email shows there." },
    },
    textarea("evidence", { label: "Approval evidence", maxLength: 1000, description: "For staff only: where the permission to display this came from (agreement, email, portal page) and when." }),
    approval("approved", "Approved to display", "Tick once the evidence is on file."),
    markets,
  ],
  hooks: audited("partner", "partner", (d) => String(d.name)),
};

export const ClientLogos: CollectionConfig = {
  slug: "client-logos",
  labels: { singular: "Client logo", plural: "Client logos" },
  orderable: true,
  admin: {
    useAsTitle: "company",
    group,
    defaultColumns: ["company", "permission", "permissionDate", "markets"],
    description: '"Businesses we look after" on the home page. Shown only with the client\'s permission. Drag to reorder.',
  },
  access,
  fields: [
    text("company", { required: true, maxLength: 80 }),
    { ...image("logo"), admin: { description: "Optional. Without a logo the company's name shows." } } as Field,
    url("website", "Website"),
    approval("permission", "Permission obtained", "Tick once the client has agreed in writing."),
    { name: "permissionDate", label: "Permission date", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayOnly" } } },
    markets,
  ],
  hooks: audited("client-logo", "client logo", (d) => String(d.company)),
};

export const ProofNumbers: CollectionConfig = {
  slug: "proof-numbers",
  labels: { singular: "Proof number", plural: "Proof numbers" },
  orderable: true,
  admin: { useAsTitle: "label", group, defaultColumns: ["value", "label", "visible", "markets"], description: "The figures on the home page, e.g. 250+ businesses we look after. Drag to reorder." },
  access,
  fields: [
    {
      name: "calculated",
      label: "Figure",
      type: "select",
      defaultValue: "typed",
      required: true,
      options: [
        { label: "Typed in below", value: "typed" },
        { label: "Median first reply (worked out from support tickets)", value: "medianFirstReply" },
      ],
      admin: { description: "The median first reply is worked out from the last 90 days of support tickets, and hides while there are fewer than 30." },
    },
    {
      ...text("value", { maxLength: 16 }),
      admin: { condition: (_, s) => s?.calculated !== "medianFirstReply", description: "e.g. 250+" },
      validate: (value: unknown, { siblingData }: { siblingData?: { calculated?: string } }) =>
        siblingData?.calculated === "medianFirstReply" || String(value ?? "").trim() ? true : "Enter the figure, e.g. 250+",
    } as Field,
    text("label", { required: true, maxLength: 60, description: "e.g. Businesses we look after" }),
    textarea("source", { label: "Source note", maxLength: 500, description: "For staff only: where the figure comes from and when it was last checked." }),
    approval("visible", "Visible", "Tick once the figure is checked."),
    markets,
  ],
  hooks: audited("proof-number", "proof number", (d) => String(d.label)),
};

export const TeamMembers: CollectionConfig = {
  slug: "team-members",
  labels: { singular: "Team member", plural: "Team members" },
  orderable: true,
  admin: {
    useAsTitle: "name",
    group,
    defaultColumns: ["name", "role", "visible", "markets"],
    description: '"People you can call by name" on the home page. Shown only with a photo and when visible. Drag to reorder.',
  },
  access,
  fields: [
    text("name", { required: true, maxLength: 60, description: "As they would like it shown, e.g. Naledi K." }),
    text("role", { required: true, maxLength: 60, description: "e.g. Customer success" }),
    image("photo"),
    approval("visible", "Visible", "Tick once they have agreed to be shown."),
    markets,
  ],
  hooks: audited("team-member", "team member", (d) => String(d.name)),
};

export const Testimonials: CollectionConfig = {
  slug: "testimonials",
  labels: { singular: "Testimonial or case study", plural: "Testimonials and case studies" },
  orderable: true,
  admin: {
    useAsTitle: "name",
    group,
    defaultColumns: ["name", "company", "permission", "markets"],
    description: "Shown by a Testimonials section on any page, only with permission. Drag to reorder.",
  },
  access,
  fields: [
    textarea("quote", { required: true, maxLength: 400 }),
    text("name", { required: true, maxLength: 60 }),
    text("role", { maxLength: 60 }),
    text("company", { maxLength: 80 }),
    { ...image("logo"), admin: { description: "Optional. The company's logo." } } as Field,
    text("result", { maxLength: 120, description: "Optional. The outcome in a few words, e.g. Moved 40 mailboxes over a weekend." }),
    approval("permission", "Permission", "Tick once the person has agreed to be quoted."),
    markets,
  ],
  hooks: audited("testimonial", "testimonial from", (d) => String(d.name)),
};

export const ShowcaseSites: CollectionConfig = {
  slug: "showcase-sites",
  labels: { singular: "Website we built", plural: "Website showcase" },
  orderable: true,
  admin: {
    useAsTitle: "client",
    group,
    defaultColumns: ["client", "industry", "permission", "markets"],
    description: 'Client websites under "Your website, your way" on the home page, only with permission. Drag to reorder.',
  },
  access,
  fields: [
    text("client", { required: true, maxLength: 80 }),
    { ...image("screenshot", { required: true }), admin: { description: "A screenshot of the home page, about 1440 by 900." } } as Field,
    text("industry", { maxLength: 60, description: "e.g. Law firm" }),
    url("url", "Address", "The live site, starting with https://"),
    approval("permission", "Permission", "Tick once the client has agreed."),
    markets,
  ],
  hooks: audited("showcase-site", "website", (d) => String(d.client)),
};

export const PROOF_COLLECTIONS = [Partners, ClientLogos, ProofNumbers, TeamMembers, Testimonials, ShowcaseSites];
