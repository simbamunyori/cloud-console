import type { Role } from "@prisma/client";

/**
 * Who may do what in a customer organisation. Every server action checks
 * here before it acts; hiding a button is only a courtesy.
 */

/** The person acting, as a member of the organisation. */
export interface Actor {
  membershipId: string;
  userId: string;
  name: string;
  role: Role;
}

export type Permission =
  /** See services, invoices, tickets and the audit log. */
  | "view"
  /** Order products and change or cancel services. */
  | "order"
  /** Pay invoices, add purchase order numbers and payment methods. */
  | "pay"
  /** Invite people and change what they can do. */
  | "manageTeam"
  /** Change the organisation's details. */
  | "manageOrganisation"
  /** Open tickets and ask the assistant. */
  | "support"
  /** See everyone's sign-ins and the full audit log. */
  | "viewSecurity"
  /** Give and take back Microsoft 365 and Google Workspace licences, and add or remove people there. */
  | "manageLicences"
  /** Ask for the account to be closed. */
  | "closeAccount";

const ALLOWED: Record<Permission, Role[]> = {
  view: ["OWNER", "ADMIN", "BILLING", "READ_ONLY"],
  order: ["OWNER", "ADMIN"],
  pay: ["OWNER", "ADMIN", "BILLING"],
  manageTeam: ["OWNER", "ADMIN"],
  manageOrganisation: ["OWNER", "ADMIN"],
  support: ["OWNER", "ADMIN", "BILLING", "READ_ONLY"],
  viewSecurity: ["OWNER", "ADMIN"],
  manageLicences: ["OWNER", "ADMIN"],
  closeAccount: ["OWNER"],
};

export function can(actor: Pick<Actor, "role">, permission: Permission): boolean {
  return ALLOWED[permission].includes(actor.role);
}

/** Which roles someone may give or take away. Only owners touch owners. */
export function canAssignRole(actor: Pick<Actor, "role">, role: Role): boolean {
  if (!can(actor, "manageTeam")) return false;
  return actor.role === "OWNER" || role !== "OWNER";
}

export class DomainError extends Error {
  constructor(
    public readonly code: "forbidden" | "not-found" | "invalid" | "conflict" | "unavailable",
    message: string,
    /** The form field the message belongs to, when there is one. */
    public readonly field?: string,
    /** Every field at fault, when a form has several mistakes. */
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertCan(actor: Pick<Actor, "role">, permission: Permission): void {
  if (!can(actor, permission)) throw new DomainError("forbidden", "Your role doesn't allow that. Ask an owner or admin.");
}

export const ROLES: Role[] = ["OWNER", "ADMIN", "BILLING", "READ_ONLY"];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  BILLING: "Billing only",
  READ_ONLY: "Read only",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Everything, including the team and closing the account.",
  ADMIN: "Orders, changes services and manages the team, except owners.",
  BILLING: "Invoices, payments and statements. Can't change services.",
  READ_ONLY: "Sees everything and can ask for help. Changes nothing.",
};
