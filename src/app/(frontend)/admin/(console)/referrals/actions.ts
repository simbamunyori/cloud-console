"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { decideApplication, recordPayout, saveReferralSettings, updatePartner } from "@/server/referrals/referrals";

async function done(result: ActionState) {
  if (result.ok) {
    await runSoon("email-deliver").catch(() => undefined);
    revalidatePath("/admin/referrals");
  }
  return result;
}

export async function decideAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const decision = field(form, "decision");
  const values = { commission: field(form, "commission") };
  return done(
    await run(async () => {
      const { staff } = await requireStaff();
      await decideApplication({ db: prisma, staff }, field(form, "id"), { decision, commission: values.commission });
      return decision === "decline" ? "Declined. They've been emailed." : "Approved. Their link and dashboard are on their way by email.";
    }, values),
  );
}

export async function updatePartnerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { status: field(form, "status"), commission: field(form, "commission") };
  return done(
    await run(async () => {
      const { staff } = await requireStaff();
      await updatePartner({ db: prisma, staff }, field(form, "id"), values);
      return "Saved.";
    }, values),
  );
}

export async function referralSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { commission: field(form, "commission") };
  return done(
    await run(async () => {
      const { staff } = await requireStaff();
      await saveReferralSettings({ db: prisma, staff }, values);
      return "Saved. It applies to statements from next month.";
    }, values),
  );
}

export async function payoutAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { reference: field(form, "reference") };
  return done(
    await run(async () => {
      const { staff } = await requireStaff();
      await recordPayout({ db: prisma, staff }, field(form, "statementId"), values.reference);
      return "Recorded. The partner has been emailed.";
    }, values),
  );
}
