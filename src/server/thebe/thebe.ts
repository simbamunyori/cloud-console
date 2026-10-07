import type { Prisma, PrismaClient } from "@prisma/client";
import type { BillingAdapter } from "@/server/billing/adapter";
import { BillingError } from "@/server/billing/adapter";
import { queueEmail } from "@/server/email/outbox";
import { featureOn } from "@/server/features/features";
import { DomainError } from "@/server/org/access";
import { audit } from "@/server/org/audit";
import { partnerConfig } from "@/server/partners/partners";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { ThebeError, thebeFrom, type ThebeClient } from "./client";

/**
 * Thebe as a billable product (docs/STRATEGY_ROLLOUT.md, U10). Thebe's
 * plans are sold and invoiced like anything else in the catalogue. Every
 * order makes its setup task first, the manual fallback; with "Thebe
 * organisations made automatically" on, the customer's Thebe organisation
 * is then created through Thebe's API and the task closes itself.
 */

export const THEBE_PLANS = ["thebe-founders", "thebe-team", "thebe-organisation"];
export const PLAN_LABEL: Record<string, string> = { "thebe-founders": "Founders", "thebe-team": "Team", "thebe-organisation": "Organisation" };
export const isThebePlan = (slug: string) => THEBE_PLANS.includes(slug);
const FEATURE = "thebe-automation";
/** Tries before it is left to the setup task alone. */
const MAX_ATTEMPTS = 3;

type Build = () => ThebeClient;

type OrderTx = { thebeAccount: { upsert: (args: Prisma.ThebeAccountUpsertArgs) => Promise<unknown> } };

/** In the order's transaction: the customer's Thebe account, waiting on its setup task. A second plan order changes the plan. */
export async function recordThebeOrder(tx: OrderTx, input: { organisationId: string; plan: string; users: number; orderId: string; taskId: string | null }) {
  const plan = { plan: input.plan, users: input.users, orderId: input.orderId, taskId: input.taskId };
  await tx.thebeAccount.upsert({ where: { organisationId: input.organisationId }, update: plan, create: { organisationId: input.organisationId, ...plan } });
}

async function clientFor(db: Pick<PrismaClient, "featureSwitch" | "partnerSetting">, build?: Build): Promise<ThebeClient | null> {
  if (!(await featureOn(db, FEATURE))) return null;
  const config = await partnerConfig(db, "thebe");
  if (!config?.enabled) return null;
  return build ? build() : thebeFrom(config.settings, config.secrets);
}

export type ThebeResult = "done" | "manual" | "failed" | "skipped";

/**
 * After the order: creates the Thebe organisation through the API, closes
 * the setup task and tells the customer, or notes Thebe's reason on the
 * task for our team. Only a new organisation is made this way; a change of
 * plan stays with the task.
 */
export async function createThebeOrganisation(db: PrismaClient, adapter: BillingAdapter, organisationId: string, deps: { build?: Build; now?: Date } = {}): Promise<ThebeResult> {
  const account = await db.thebeAccount.findUnique({ where: { organisationId }, include: { organisation: true } });
  if (!account || account.thebeId || account.status === "ACTIVE" || account.attempts >= MAX_ATTEMPTS) return "skipped";
  const client = await clientFor(db, deps.build);
  if (!client) return "manual";
  const now = deps.now ?? new Date();
  const owner = await db.membership.findFirst({ where: { organisationId, role: "OWNER", active: true }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } } } });
  let made: { id: string; url: string } | null;
  try {
    made = await client.createOrganisation({
      reference: organisationId,
      name: account.organisation.name,
      plan: PLAN_LABEL[account.plan] ?? account.plan,
      users: account.users,
      owner: { name: owner?.user.name ?? account.organisation.name, email: owner?.user.email ?? "" },
      country: account.organisation.country,
    });
  } catch (e) {
    if (!(e instanceof ThebeError)) throw e;
    await db.thebeAccount.update({ where: { id: account.id }, data: { status: "FAILED", attempts: { increment: 1 }, error: e.message.slice(0, 500) } });
    if (account.taskId) {
      const task = await db.provisioningTask.findUnique({ where: { id: account.taskId }, select: { notes: true } });
      await db.provisioningTask.update({ where: { id: account.taskId }, data: { notes: [task?.notes, `Thebe refused it automatically: ${e.message} Please create it by hand, then record its address on the customer's page.`].filter(Boolean).join("\n") } });
    }
    return "failed";
  }
  if (!made) return "manual";

  const order = account.orderId ? await db.order.findUnique({ where: { id: account.orderId } }) : null;
  const closesOrder = order?.status === "SETTING_UP" && account.taskId ? (await db.provisioningTask.count({ where: { orderId: order.id, status: { in: ["OPEN", "IN_PROGRESS"] }, id: { not: account.taskId } } })) === 0 : false;
  if (closesOrder && order?.billingOrderId) {
    await adapter.acceptOrder(order.billingOrderId).catch((e) => {
      if (!(e instanceof BillingError && e.code === "conflict")) throw e;
    });
  }
  await db.$transaction(async (tx) => {
    await tx.thebeAccount.update({ where: { id: account.id }, data: { status: "ACTIVE", thebeId: made.id, url: made.url, attempts: { increment: 1 }, error: null } });
    if (account.taskId) await tx.provisioningTask.updateMany({ where: { id: account.taskId, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: now, notes: `Done automatically through Thebe: ${made.url}` } });
    await audit(tx, { organisationId, actorKind: "SYSTEM", actorLabel: "Fourth Generation Technologies", action: "thebe.ready", summary: `Your Thebe organisation is ready`, targetType: "ThebeAccount", targetId: account.id });
    if (closesOrder && order) {
      await tx.order.update({ where: { id: order.id }, data: { status: "ACTIVE" } });
      const placedBy = await tx.user.findUnique({ where: { id: order.placedById }, select: { email: true } });
      if (placedBy) await queueEmail(tx, { organisationId, to: placedBy.email, kind: "order.ready", payload: { orderId: order.id, note: `Sign in to Thebe at ${made.url} with ${owner?.user.email ?? "your email address"}. Thebe will email you to set your password.` } });
    }
  });
  return "done";
}

/** Nightly: tries again for accounts Thebe refused, up to three times in all. */
export async function retryThebe(db: PrismaClient, adapter: BillingAdapter, deps: { build?: Build; now?: Date } = {}) {
  const waiting = await db.thebeAccount.findMany({ where: { thebeId: null, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } }, select: { organisationId: true } });
  let done = 0;
  for (const w of waiting) if ((await createThebeOrganisation(db, adapter, w.organisationId, deps)) === "done") done++;
  return done;
}

/** Staff record a Thebe organisation made by hand (manual mode, or after Thebe refused). */
export async function recordThebeOrganisation(deps: { db: PrismaClient; staff: StaffActor }, organisationId: string, input: { thebeId: string; url: string }) {
  assertStaffCan(deps.staff, "workTasks");
  const account = await deps.db.thebeAccount.findUnique({ where: { organisationId } });
  if (!account) throw new DomainError("not-found", "This customer has no Thebe plan.");
  const fieldErrors: Record<string, string> = {};
  const url = input.url.trim();
  const thebeId = input.thebeId.trim();
  if (!/^https:\/\/\S+$/.test(url)) fieldErrors.url = "Enter the address starting with https://.";
  if (!thebeId || thebeId.length > 120) fieldErrors.thebeId = "Enter Thebe's id for the organisation.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  await deps.db.$transaction(async (tx) => {
    await tx.thebeAccount.update({ where: { id: account.id }, data: { status: "ACTIVE", thebeId, url, error: null } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "thebe.recorded", summary: "Recorded the Thebe organisation", targetType: "ThebeAccount", targetId: account.id }));
  });
}
