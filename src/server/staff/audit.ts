import type { AuditInput } from "@/server/org/audit";
import { staffLabel, type StaffActor } from "./access";

/** A staff member acting on a customer account. Always visible to the customer. */
export function staffAudit(staff: StaffActor, organisationId: string, rest: Omit<AuditInput, "organisationId" | "actorKind" | "actorUserId" | "actorLabel" | "visibleToCustomer">): AuditInput {
  return { organisationId, actorKind: "STAFF", actorUserId: staff.userId, actorLabel: staffLabel(staff), visibleToCustomer: true, ...rest };
}
