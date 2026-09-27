import type { StaffRole } from "@prisma/client";
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
  | "manageMarkets";

const ALLOWED: Record<StaffPermission, StaffRole[]> = {
  viewCustomers: ["SUPPORT", "PROVISIONING", "FINANCE", "ADMIN"],
  workTasks: ["PROVISIONING", "ADMIN"],
  confirmPayments: ["FINANCE", "ADMIN"],
  answerTickets: ["SUPPORT", "ADMIN"],
  managePricing: ["ADMIN"],
  manageMarkets: ["ADMIN"],
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
