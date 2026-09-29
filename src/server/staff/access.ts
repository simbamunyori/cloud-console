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
  /** Give staff a website role. */
  | "manageStaff"
  /** Create and change product families, categories and products, and mark our own test organisations. */
  | "manageCatalogue"
  /** Work the Quotes queue: price requests, send quotes and close them. */
  | "manageQuotes";

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
