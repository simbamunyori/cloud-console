import type { ActorKind, Prisma } from "@prisma/client";

type AuditClient = { auditEvent: { create: (args: { data: Prisma.AuditEventUncheckedCreateInput }) => Promise<unknown> } };

export interface AuditInput {
  organisationId: string;
  actorKind: ActorKind;
  actorUserId?: string | null;
  actorLabel: string;
  /** Dotted code, e.g. "member.invited". */
  action: string;
  /** One plain sentence the customer reads, e.g. "Invited thabo@acme.co.bw as Admin". */
  summary: string;
  targetType?: string;
  targetId?: string;
  data?: Prisma.InputJsonValue;
  /** Staff actions are always visible; only internal bookkeeping is hidden. */
  visibleToCustomer?: boolean;
  ipAddress?: string | null;
}

/** Appends one row to the organisation's audit log. Rows can never change. */
export async function audit(tx: AuditClient, input: AuditInput) {
  if (input.actorKind === "STAFF" && input.visibleToCustomer === false) {
    throw new Error("Staff actions on a customer account are always visible to the customer.");
  }
  await tx.auditEvent.create({
    data: {
      organisationId: input.organisationId,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel,
      action: input.action,
      summary: input.summary,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      data: input.data,
      visibleToCustomer: input.visibleToCustomer ?? true,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

/** Shorthand for a customer acting on their own organisation. */
export function customerAudit(
  actor: { userId: string; name: string },
  organisationId: string,
  rest: Omit<AuditInput, "organisationId" | "actorKind" | "actorUserId" | "actorLabel">,
): AuditInput {
  return { organisationId, actorKind: "CUSTOMER", actorUserId: actor.userId, actorLabel: actor.name, ...rest };
}
