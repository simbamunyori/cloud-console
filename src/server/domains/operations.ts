import type { DomainOperation, Prisma, PrismaClient } from "@prisma/client";
import { BillingError, type BillingAdapter } from "@/server/billing/adapter";
import { queueEmail } from "@/server/email/outbox";
import { audit } from "@/server/org/audit";
import { openValue } from "@/server/partners/vault";
import { registrarByKey } from "./active";
import type { Registrar, RegistrarContact, RegistrarKey } from "./registrar";

/**
 * Domain work that runs on its own once it is paid (docs/STRATEGY_ROLLOUT.md,
 * U1): registrations, transfers and renewals ordered while a registrar is
 * switched on for the ending. A job checks every few minutes.
 *
 * Openprovider: WHMCS is the billing engine and its Openprovider registrar
 * module does the registry work when the paid order is accepted (and renews
 * when a renewal invoice is paid); the console accepts the order and then
 * checks with Openprovider that it happened.
 * The .bw registry: WHMCS has no module for it, so the console registers,
 * renews or transfers itself and then tells WHMCS the dates.
 *
 * Anything that fails three times, or isn't confirmed in time, becomes a
 * staff task in the Setup queue with what went wrong.
 */

/** When a customer is told an automatic registration should be ready by, after paying. */
export { AUTOMATIC_DOMAIN_HOURS } from "./registrar";
const MAX_ATTEMPTS = 3;
/** How long to wait for the registrar to confirm before a person looks. Transfers wait for the other registrar. */
const CONFIRM_HOURS: Record<DomainOperation["kind"], number> = { REGISTER: 6, RENEW: 12, TRANSFER: 24 * 8 };
/** A renewal or registration left unpaid this long is dropped (the invoice stays for the customer and staff). */
const UNPAID_DAYS = 60;

export interface OperationDeps {
  db: PrismaClient;
  adapter: BillingAdapter;
  now?: Date;
  /** Tests pass fakes. */
  registrarFor?: (key: RegistrarKey) => Promise<Registrar | null>;
}

const LABEL: Record<DomainOperation["kind"], string> = { REGISTER: "Register", TRANSFER: "Transfer in", RENEW: "Renew" };

/** What the registry needs about the customer, from their organisation and its owner. */
export async function registrantFor(db: PrismaClient, organisationId: string): Promise<RegistrarContact> {
  const org = await db.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    include: { memberships: { where: { role: "OWNER", active: true }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const owner = org.memberships[0]?.user;
  const [first, ...rest] = (owner?.name ?? org.name).trim().split(/\s+/);
  return {
    firstName: first ?? org.name,
    lastName: rest.join(" ") || first || org.name,
    companyName: org.name,
    email: org.billingEmail ?? owner?.email ?? "",
    phone: org.phone ?? "",
    address: [org.addressLine1, org.addressLine2].filter(Boolean).join(", "),
    city: org.city ?? "",
    postcode: org.postcode ?? undefined,
    country: org.country,
  };
}

async function clientIdOf(db: PrismaClient, organisationId: string) {
  const account = await db.billingAccount.findUnique({ where: { organisationId } });
  return account?.externalClientId ?? null;
}

async function staffTask(db: PrismaClient, op: DomainOperation, reason: string, now: Date) {
  const steps =
    op.kind === "RENEW"
      ? [`Renew ${op.domain} for ${op.years} year(s) at the registrar.`, "Check the new expiry date shows in WHMCS.", "Mark this done."]
      : op.kind === "TRANSFER"
        ? [`Check the transfer of ${op.domain} at the registrar and finish it by hand if it stalled.`, "Accept the order in the billing system once the domain is with us.", "Mark this done. The customer is told straight away."]
        : [`Register ${op.domain} for ${op.years} year(s) at the registrar by hand.`, "Mark this done. The customer is told straight away."];
  const task = await db.provisioningTask.create({
    data: {
      organisationId: op.organisationId,
      orderId: op.kind === "RENEW" ? null : op.orderId,
      family: "WEB_AND_DOMAINS",
      kind: "domain_operation",
      title: `${LABEL[op.kind]} ${op.domain}: finish by hand`,
      instructions: [`The automatic ${LABEL[op.kind].toLowerCase()} through ${op.registrar === "openprovider" ? "Openprovider" : "the .bw registry"} didn't finish.`, `What went wrong: ${reason}`, "", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"),
      expectedBy: new Date(now.getTime() + 8 * 3_600_000),
    },
  });
  await db.domainOperation.update({ where: { id: op.id }, data: { status: "FAILED", attempts: op.attempts, lastError: reason.slice(0, 500), taskId: task.id, authCodeSealed: null } });
}

/** The order is ready: as when staff finish its last task (src/server/admin/tasks.ts). */
async function finishOrder(tx: Prisma.TransactionClient, op: DomainOperation) {
  if (!op.orderId) return;
  const order = await tx.order.findUnique({ where: { id: op.orderId } });
  if (!order || order.status !== "SETTING_UP") return;
  await tx.order.update({ where: { id: order.id }, data: { status: "ACTIVE" } });
  await audit(tx, { organisationId: op.organisationId, actorKind: "SYSTEM", actorLabel: "Fourth Generation Technologies", action: "order.ready", summary: `Order ${order.reference} is ready`, targetType: "Order", targetId: order.id });
  const placedBy = await tx.user.findUnique({ where: { id: order.placedById }, select: { email: true } });
  if (placedBy) await queueEmail(tx, { organisationId: op.organisationId, to: placedBy.email, kind: "order.ready", payload: { orderId: order.id } });
}

async function done(db: PrismaClient, op: DomainOperation, now: Date, summary: string) {
  await db.$transaction(async (tx) => {
    const claimed = await tx.domainOperation.updateMany({ where: { id: op.id, status: { in: ["WAITING_PAYMENT", "SUBMITTED"] } }, data: { status: "DONE", completedAt: now, authCodeSealed: null, lastError: null } });
    if (!claimed.count) return;
    if (op.kind !== "RENEW") await finishOrder(tx, op);
    await audit(tx, { organisationId: op.organisationId, actorKind: "SYSTEM", actorLabel: "Fourth Generation Technologies", action: `domain.${op.kind.toLowerCase()}ed`, summary, targetType: "Domain", targetId: op.billingDomainId ?? op.domain });
  });
}

/** Paid yet? Null when the invoice is gone or cancelled. */
async function paid(deps: OperationDeps, op: DomainOperation, clientId: string): Promise<boolean | null> {
  if (!op.billingInvoiceId) return true;
  const invoice = await deps.adapter.getInvoice(clientId, op.billingInvoiceId);
  if (!invoice || invoice.status === "cancelled" || invoice.status === "refunded") return null;
  return invoice.status === "paid";
}

/** Sends a paid operation on its way. Returns the new status. */
async function submit(deps: OperationDeps, op: DomainOperation, registrar: Registrar, now: Date) {
  const db = deps.db;
  const viaWhmcsModule = !registrar.register;
  if (op.kind === "RENEW") {
    if (viaWhmcsModule) {
      // WHMCS's registrar module renews when the renewal invoice is paid; we only check it happened.
      await db.domainOperation.update({ where: { id: op.id }, data: { status: "SUBMITTED", submittedAt: now } });
      return;
    }
    if (!op.previousExpiry) throw new Error("The expiry date before the renewal wasn't recorded.");
    const { expiresOn } = await registrar.renew!(op.domain, op.years, op.previousExpiry);
    if (op.billingDomainId) await deps.adapter.updateDomain(op.billingDomainId, { status: "active", expiresOn, nextDueOn: expiresOn });
    await done(db, op, now, `Renewed ${op.domain} to ${expiresOn.toISOString().slice(0, 10)}`);
    return;
  }

  if (viaWhmcsModule) {
    if (op.billingOrderId) {
      await deps.adapter.acceptOrder(op.billingOrderId, { registrar: registrar.key }).catch((e) => {
        if (!(e instanceof BillingError && e.code === "conflict")) throw e;
      });
    }
    await db.domainOperation.update({ where: { id: op.id }, data: { status: "SUBMITTED", submittedAt: now } });
    return;
  }

  // The console carries out the registry work itself.
  if (op.kind === "REGISTER") {
    const contact = await registrantFor(db, op.organisationId);
    const { expiresOn } = await registrar.register!(op.domain, op.years, contact, []);
    if (op.billingOrderId) await deps.adapter.acceptOrder(op.billingOrderId, { sendToRegistrar: false }).catch((e) => {
      if (!(e instanceof BillingError && e.code === "conflict")) throw e;
    });
    if (op.billingDomainId) await deps.adapter.updateDomain(op.billingDomainId, { status: "active", expiresOn, nextDueOn: expiresOn });
    await done(db, op, now, `Registered ${op.domain} until ${expiresOn.toISOString().slice(0, 10)}`);
    return;
  }
  if (!op.authCodeSealed) throw new Error("The transfer code wasn't kept.");
  await registrar.transfer!(op.domain, openValue(op.authCodeSealed), await registrantFor(db, op.organisationId));
  await db.domainOperation.update({ where: { id: op.id }, data: { status: "SUBMITTED", submittedAt: now, authCodeSealed: null } });
}

/** After submitting: has the registrar got it? */
async function confirm(deps: OperationDeps, op: DomainOperation, registrar: Registrar, clientId: string, now: Date) {
  const info = await registrar.info(op.domain);
  if (op.kind === "RENEW") {
    if (info?.expiresOn && op.previousExpiry && info.expiresOn > op.previousExpiry) {
      await done(deps.db, op, now, `Renewed ${op.domain} to ${info.expiresOn.toISOString().slice(0, 10)}`);
      return true;
    }
    return false;
  }
  const billing = (await deps.adapter.listDomains(clientId)).find((d) => d.name === op.domain);
  const atRegistrar = info && (info.status === "active" || info.status === "being registered");
  if (atRegistrar || billing?.status === "active") {
    if (op.kind === "TRANSFER" && registrar.register && op.billingOrderId) {
      // Our own transfers: accept the order once the domain has arrived.
      await deps.adapter.acceptOrder(op.billingOrderId, { sendToRegistrar: false }).catch((e) => {
        if (!(e instanceof BillingError && e.code === "conflict")) throw e;
      });
      if (op.billingDomainId && info?.expiresOn) await deps.adapter.updateDomain(op.billingDomainId, { status: "active", expiresOn: info.expiresOn, nextDueOn: info.expiresOn });
    }
    await done(deps.db, op, now, `${op.kind === "TRANSFER" ? "Transferred in" : "Registered"} ${op.domain}`);
    return true;
  }
  return false;
}

/** One pass over the waiting work. Returns how many operations moved on. */
export async function runDomainOperations(deps: OperationDeps): Promise<number> {
  const now = deps.now ?? new Date();
  const registrarFor = deps.registrarFor ?? ((key: RegistrarKey) => registrarByKey(deps.db, key));
  const ops = await deps.db.domainOperation.findMany({ where: { status: { in: ["WAITING_PAYMENT", "SUBMITTED"] } }, orderBy: { createdAt: "asc" }, take: 100 });
  let moved = 0;
  for (const op of ops) {
    try {
      const clientId = await clientIdOf(deps.db, op.organisationId);
      if (!clientId) continue;
      const registrar = await registrarFor(op.registrar as RegistrarKey);
      if (op.status === "WAITING_PAYMENT") {
        const isPaid = await paid(deps, op, clientId);
        if (isPaid === null || (!isPaid && now.getTime() - op.createdAt.getTime() > UNPAID_DAYS * 86_400_000)) {
          await deps.db.domainOperation.update({ where: { id: op.id }, data: { status: "CANCELLED", authCodeSealed: null } });
          moved++;
          continue;
        }
        if (!isPaid) continue;
        if (!registrar) {
          await staffTask(deps.db, op, "The registrar was switched off before the work could start.", now);
          moved++;
          continue;
        }
        await submit(deps, op, registrar, now);
        moved++;
        continue;
      }
      // SUBMITTED
      if (!registrar) continue;
      if (await confirm(deps, op, registrar, clientId, now)) {
        moved++;
        continue;
      }
      const since = (op.submittedAt ?? op.updatedAt).getTime();
      if (now.getTime() - since > CONFIRM_HOURS[op.kind] * 3_600_000) {
        await staffTask(deps.db, op, `The registrar hadn't confirmed it after ${CONFIRM_HOURS[op.kind]} hours.`, now);
        moved++;
      }
    } catch (e) {
      const reason = (e as Error).message || "Unknown error.";
      const attempts = op.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) await staffTask(deps.db, { ...op, attempts }, reason, now);
      else await deps.db.domainOperation.update({ where: { id: op.id }, data: { attempts, lastError: reason.slice(0, 500) } });
      moved++;
    }
  }
  return moved;
}
