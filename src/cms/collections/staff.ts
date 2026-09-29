import type { AuthStrategy, CollectionConfig } from "payload";

/**
 * Signs staff into the website editor with their staff console session:
 * the same password, authenticator code and cookie. Payload's own
 * passwords are switched off. Each staff member gets a record here the
 * first time they open the editor; their website role is copied from the
 * console on every request, so a change takes effect straight away.
 */
const consoleStaff: AuthStrategy = {
  name: "console-staff",
  authenticate: async ({ payload, headers }) => {
    // Loaded here so the Payload command line can read this config without the console's server code.
    const [{ websiteStaffFromCookies }, { authDeps }] = await Promise.all([import("@/server/cms/staff-session"), import("@/server/auth/next")]);
    const staff = await websiteStaffFromCookies(authDeps(), headers.get("cookie"));
    if (!staff) return { user: null };
    const data = { consoleUserId: staff.userId, name: staff.name, email: staff.email, websiteRole: staff.websiteRole };
    const { docs } = await payload.find({ collection: "staff", where: { consoleUserId: { equals: staff.userId } }, limit: 1, depth: 0, overrideAccess: true });
    let user = docs[0];
    if (!user) user = await payload.create({ collection: "staff", data, overrideAccess: true });
    else if (user.name !== data.name || user.email !== data.email || user.websiteRole !== data.websiteRole) {
      user = await payload.update({ collection: "staff", id: user.id, data, overrideAccess: true });
    }
    return { user: { ...user, collection: "staff", _strategy: "console-staff" } };
  },
};

export const Staff: CollectionConfig = {
  slug: "staff",
  labels: { singular: "Staff member", plural: "Staff" },
  admin: { useAsTitle: "name", group: "Settings", description: "Website roles are set on the Staff page in the staff console." },
  auth: { disableLocalStrategy: true, strategies: [consoleStaff] },
  access: {
    admin: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    // Records come from the staff console, never from the editor.
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "consoleUserId", type: "text", required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: "name", type: "text", required: true, admin: { readOnly: true } },
    { name: "email", type: "email", required: true, admin: { readOnly: true } },
    {
      name: "websiteRole",
      type: "select",
      required: true,
      options: [
        { label: "Editor", value: "EDITOR" },
        { label: "Publisher", value: "PUBLISHER" },
      ],
      admin: { readOnly: true },
    },
  ],
};
