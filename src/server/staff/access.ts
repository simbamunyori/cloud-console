import type { StaffRole, WebsiteRole } from "@prisma/client";
import { DomainError } from "@/server/org/access";

/**
 * What each staff role may do in the admin console. Checked on the server
 * before every staff action, as the customer permissions are.
 */

export interface StaffActor {
  userId: string;
  name: string;
  staffRole: StaffRole;
}

export type StaffPermission =
  /** Read customer accounts, orders and the audit log. */
  | "viewCustomers"
  /** Work the provisioning task queue. */
  | "workTasks"
  /** Confirm or reject EFT payments. */
  | "confirmPayments"
  /** Answer support tickets. */
  | "answerTickets"
  /** Change margins, the currency buffer and exchange rates. */
  | "managePricing"
  /** Change market settings, switch markets on and off, and move a customer to another market. */
  | "manageMarkets"
  /** Invite staff, change their role or website role, and deactivate them. */
  | "manageStaff"
  /** Create and change product families, categories and products, and mark our own test organisations. */
  | "manageCatalogue"
  /** Work the Quotes queue: price requests, send quotes and close them. */
  | "manageQuotes"
  /** Link Azure subscriptions, import usage files and add ways to save. */
  | "manageCloudSpend"
  /** Put a month's Azure usage on customers' invoices. */
  | "billCloudUsage"
  /** Post and resolve incidents on the service status page. */
  | "manageStatus"
  /** Bring clients over from Odoo: upload, approve the import and choose the cutover date. */
  | "migrateClients"
  /** Record where a service hosted elsewhere lives, and move it to our servers. */
  | "manageHosting"
  /** Turn new features on and off (Admin > Features). */
  | "manageFeatures"
  /** Set up partners: registrars and providers, with their credentials (Admin > Partners). */
  | "managePartners"
  /** Company details, logos and bank accounts (Admin > Company). */
  | "manageCompany"
  /** Work the SOC incident queue, customers' security tenants, devices and reports. */
  | "workSoc"
  /** The success dashboard, its targets and the directors' monthly email (Admin > Success). */
  | "viewSuccess";

const ALLOWED: Record<StaffPermission, StaffRole[]> = {
  viewCustomers: ["SUPPORT", "PROVISIONING", "FINANCE", "ADMIN"],
  workTasks: ["PROVISIONING", "ADMIN"],
  confirmPayments: ["FINANCE", "ADMIN"],
  answerTickets: ["SUPPORT", "ADMIN"],
  managePricing: ["ADMIN"],
  manageMarkets: ["ADMIN"],
  manageStaff: ["ADMIN"],
  manageCatalogue: ["ADMIN"],
  manageQuotes: ["SUPPORT", "ADMIN"],
  manageCloudSpend: ["PROVISIONING", "FINANCE", "ADMIN"],
  billCloudUsage: ["FINANCE", "ADMIN"],
  manageStatus: ["SUPPORT", "PROVISIONING", "ADMIN"],
  migrateClients: ["ADMIN"],
  manageHosting: ["PROVISIONING", "ADMIN"],
  manageFeatures: ["ADMIN"],
  managePartners: ["ADMIN"],
  manageCompany: ["ADMIN"],
  workSoc: ["SUPPORT", "PROVISIONING", "ADMIN"],
  viewSuccess: ["ADMIN"],
};

export function staffCan(actor: Pick<StaffActor, "staffRole">, permission: StaffPermission): boolean {
  return ALLOWED[permission].includes(actor.staffRole);
}

export function assertStaffCan(actor: Pick<StaffActor, "staffRole">, permission: StaffPermission): void {
  if (!staffCan(actor, permission)) throw new DomainError("forbidden", "Your staff role doesn't allow that.");
}

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  SUPPORT: "Support",
  PROVISIONING: "Provisioning",
  FINANCE: "Finance",
  ADMIN: "Admin",
};

export const STAFF_ROLES: StaffRole[] = ["SUPPORT", "PROVISIONING", "FINANCE", "ADMIN"];

export const STAFF_ROLE_DESCRIPTION: Record<StaffRole, string> = {
  SUPPORT: "Answers tickets, works the Quotes queue and posts status updates. Sees customer accounts.",
  PROVISIONING: "Works the provisioning tasks, cloud spend and hosting moves. Sees customer accounts.",
  FINANCE: "Confirms EFT payments and bills cloud usage. Sees customer accounts.",
  ADMIN: "Everything, including pricing, markets, the catalogue, staff and publishing the website.",
};

/** How staff appear in a customer's audit log. The page adds that they are our staff, from the actor kind. */
export const staffLabel = (actor: Pick<StaffActor, "name">) => actor.name;

// ─── The website editor ─────────────────────────────────────────────

/** What a staff member may do in the website editor, or null for nothing. Admins can always publish. */
export function websiteRoleOf(user: { staffRole: StaffRole | null; websiteRole: WebsiteRole | null }): WebsiteRole | null {
  if (!user.staffRole) return null;
  if (user.staffRole === "ADMIN") return "PUBLISHER";
  return user.websiteRole;
}

/** Publish, schedule, restore a version and approve legal text. */
export const canPublishWebsite = (role: WebsiteRole | null | undefined) => role === "PUBLISHER";

export const WEBSITE_ROLE_LABEL: Record<WebsiteRole, string> = {
  EDITOR: "Editor",
  PUBLISHER: "Publisher",
};
