import type { PrismaClient, TaskStatus } from "@prisma/client";
import { BillingError, type BillingAdapter } from "@/server/billing/adapter";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { audit, type AuditInput } from "@/server/org/audit";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";

/**
 * The provisioning queue: work the manual connectors hand to staff. When
 * the last task on an order is done, the order goes live in the billing
 * engine and the customer is told. Every step is written to the
 * customer's audit log, where they can see it.
 */

export interface StaffDeps {
  db: PrismaClient;
  adapter: BillingAdapter;
  staff: StaffActor;
  now?: Date;
}

const OPEN: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

export function staffAudit(staff: StaffActor, organisationId: string, rest: Omit<AuditInput, "organisationId" | "actorKind" | "actorUserId" | "actorLabel" | "visibleToCustomer">): AuditInput {
  return { organisationId, actorKind: "STAFF", actorUserId: staff.userId, actorLabel: staffLabel(staff), visibleToCustomer: true, ...rest };
}

export async function taskQueue(db: PrismaClient, filter: { status?: "open" | "done"; assigneeId?: string } = {}) {
  return db.provisioningTask.findMany({
    where: { status: filter.status === "done" ? "DONE" : { in: OPEN }, ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}) },
    orderBy: filter.status === "done" ? { completedAt: "desc" } : { expectedBy: "asc" },
    take: 100,
    include: { organisation: { select: { id: true, name: true } }, order: { select: { reference: true } }, assignee: { select: { name: true } }, completedBy: { select: { name: true } } },
  });
}

async function openTask(db: PrismaClient, taskId: string) {
  const task = await db.provisioningTask.findUnique({ where: { id: taskId }, include: { order: true } });
  if (!task) throw new DomainError("not-found", "No such task.");
  if (!OPEN.includes(task.status)) throw new DomainError("conflict", "This task is already finished.");
  return task;
}

/** Takes a task: it's yours and in progress. */
export async function startTask(deps: StaffDeps, taskId: string) {
  assertStaffCan(deps.staff, "workTasks");
  const task = await openTask(deps.db, taskId);
  return deps.db.$transaction(async (tx) => {
    const updated = await tx.provisioningTask.update({ where: { id: task.id }, data: { status: "IN_PROGRESS", assigneeId: deps.staff.userId } });
    await audit(tx, staffAudit(deps.staff, task.organisationId, { action: "task.started", summary: `Started: ${task.title}`, targetType: "Order", targetId: task.orderId ?? undefined }));
    return updated;
  });
}

/**
 * Marks a task done. When it was the order's last open task, the order is
 * accepted in the billing engine (which activates its services), marked
 * active, and the customer gets an email, with the note if there is one.
 */
export async function completeTask(deps: StaffDeps, taskId: string, input: { note?: string } = {}) {
  assertStaffCan(deps.staff, "workTasks");
  const task = await openTask(deps.db, taskId);
  const note = input.note?.trim().slice(0, 1000) || undefined;
  const now = deps.now ?? new Date();

  const claimed = await deps.db.provisioningTask.updateMany({
    where: { id: task.id, status: { in: OPEN } },
    data: { status: "DONE", completedById: deps.staff.userId, completedAt: now, assigneeId: task.assigneeId ?? deps.staff.userId, notes: note ?? task.notes },
  });
  if (!claimed.count) throw new DomainError("conflict", "Someone else finished this task first.");

  const order = task.order;
  const remaining = order ? await deps.db.provisioningTask.count({ where: { orderId: order.id, status: { in: OPEN } } }) : 0;
  const finishesOrder = order && order.status === "SETTING_UP" && remaining === 0;

  if (finishesOrder && order.billingOrderId && !order.changesServiceId) {
    try {
      await deps.adapter.acceptOrder(order.billingOrderId);
    } catch (e) {
      // Already accepted in the billing engine is fine; anything else puts the task back.
      if (!(e instanceof BillingError && e.code === "conflict")) {
        await deps.db.provisioningTask.update({ where: { id: task.id }, data: { status: task.status, completedById: null, completedAt: null, notes: task.notes } });
        throw e instanceof BillingError ? new DomainError("conflict", `The billing system didn't accept the order: ${e.message}`) : e;
      }
    }
  }

  return deps.db.$transaction(async (tx) => {
    await audit(tx, staffAudit(deps.staff, task.organisationId, { action: "task.done", summary: `Done: ${task.title}`, targetType: "Order", targetId: task.orderId ?? undefined, data: note ? { note } : undefined }));
    if (finishesOrder) {
      await tx.order.update({ where: { id: order.id }, data: { status: "ACTIVE" } });
      await audit(tx, staffAudit(deps.staff, task.organisationId, { action: "order.ready", summary: `Order ${order.reference} is ready`, targetType: "Order", targetId: order.id }));
      const placedBy = await tx.user.findUnique({ where: { id: order.placedById }, select: { email: true } });
      if (placedBy) await queueEmail(tx, { organisationId: task.organisationId, to: placedBy.email, kind: "order.ready", payload: { orderId: order.id, ...(note ? { note } : {}) } });
    }
    return { task: await tx.provisioningTask.findUniqueOrThrow({ where: { id: task.id } }), orderReady: Boolean(finishesOrder) };
  });
}
