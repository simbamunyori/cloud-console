import type { PrismaClient } from "@prisma/client";
import { formatMoney, MoneyParseError, parseMoney } from "@/lib/domain/money";
import type { TenantDb } from "@/server/db";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";

/**
 * Acting on a way to save. The customer asks us to make the change (a
 * staff task) or hides it; staff add tips they find, e.g. in Azure Advisor.
 */

export const SAVING_TASK = "saving";
/** Working hours staff have to make a saving change. */
export const SAVING_HOURS = 24;

type Ctx = { organisationId: string; organisationName: string; actor: Actor; now?: Date };

async function openTip(db: Pick<TenantDb, "savingTip">, id: string) {
  const tip = await db.savingTip.findFirst({ where: { id } });
  if (!tip) throw new DomainError("not-found", "That saving isn't on your account.");
  if (tip.status !== "OPEN") throw new DomainError("conflict", tip.status === "ASKED" ? "We're already on it." : "That saving is closed.");
  return tip;
}

export async function askForSaving(db: TenantDb, ctx: Ctx, tipId: string) {
  assertCan(ctx.actor, "order");
  const now = ctx.now ?? new Date();
  return db.$transaction(async (tx) => {
    const tip = await openTip(tx, tipId);
    const task = await tx.provisioningTask.create({
      data: {
        organisationId: ctx.organisationId,
        family: "PUBLIC_CLOUD",
        kind: SAVING_TASK,
        title: `${tip.title} (${ctx.organisationName})`,
        instructions: [
          `${ctx.actor.name} asked us to make this saving, worth about ${formatMoney({ amountMinor: tip.monthlyMinor, currency: tip.currency }, "en-BW")} a month.`,
          "",
          tip.detail,
          "",
          "Confirm with them what may be removed, and offer a backup copy first. Make the change in the Azure portal, then mark this done.",
        ].join("\n"),
        expectedBy: new Date(now.getTime() + SAVING_HOURS * 3_600_000),
      },
    });
    const updated = await tx.savingTip.update({ where: { id: tip.id }, data: { status: "ASKED", taskId: task.id, decidedById: ctx.actor.userId, decidedAt: now } });
    await audit(tx, customerAudit(ctx.actor, ctx.organisationId, { action: "saving.asked", summary: `Asked us to act on "${tip.title}"`, targetType: "SavingTip", targetId: tip.id }));
    return updated;
  });
}

export async function dismissSaving(db: TenantDb, ctx: Ctx, tipId: string) {
  assertCan(ctx.actor, "order");
  const now = ctx.now ?? new Date();
  return db.$transaction(async (tx) => {
    const tip = await openTip(tx, tipId);
    const updated = await tx.savingTip.update({ where: { id: tip.id }, data: { status: "DISMISSED", decidedById: ctx.actor.userId, decidedAt: now } });
    await audit(tx, customerAudit(ctx.actor, ctx.organisationId, { action: "saving.dismissed", summary: `Hid "${tip.title}"`, targetType: "SavingTip", targetId: tip.id }));
    return updated;
  });
}

export interface StaffTipDeps {
  db: PrismaClient;
  staff: StaffActor;
}

/** A saving staff found, e.g. an oversized server in Azure Advisor. */
export async function addSaving(deps: StaffTipDeps, organisationId: string, input: { title: string; detail: string; monthly: string }) {
  assertStaffCan(deps.staff, "manageCloudSpend");
  const org = await deps.db.organisation.findUnique({ where: { id: organisationId }, select: { currency: true } });
  if (!org) throw new DomainError("not-found", "No such customer.");
  const title = input.title.trim();
  const detail = input.detail.trim();
  const errors: Record<string, string> = {};
  if (title.length < 5 || title.length > 120) errors.title = "Say what to change in a short line, like \"The accounts server is bigger than it needs to be\".";
  if (detail.length < 10 || detail.length > 1000) errors.detail = "Explain the change and what it means for them.";
  let monthlyMinor = 0n;
  try {
    monthlyMinor = parseMoney(input.monthly, org.currency);
    if (monthlyMinor <= 0n) errors.monthly = "Enter what it saves a month.";
  } catch (e) {
    if (!(e instanceof MoneyParseError)) throw e;
    errors.monthly = "Enter what it saves a month, like 450.00.";
  }
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], Object.keys(errors)[0], errors);
  return deps.db.$transaction(async (tx) => {
    const tip = await tx.savingTip.create({ data: { organisationId, key: `staff:${crypto.randomUUID()}`, source: "STAFF", title, detail, monthlyMinor, currency: org.currency, createdById: deps.staff.userId } });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "saving.added", summary: `Added a saving: ${title}`, targetType: "SavingTip", targetId: tip.id }));
    return tip;
  });
}
