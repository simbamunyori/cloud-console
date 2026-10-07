"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { addProtection, setRestoreStatus, syncBackups, updateProtection } from "@/server/backup/backup";
import { prisma } from "@/server/db";

const refresh = () => {
  revalidatePath("/admin/backups");
  revalidatePath("/app/backup");
};

export async function updateProtectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = {
    label: field(form, "label"),
    health: field(form, "health"),
    lastSuccessAt: field(form, "lastSuccessAt"),
    retentionDays: field(form, "retentionDays"),
    coverage: field(form, "coverage"),
    providerRef: field(form, "providerRef"),
    notes: field(form, "notes"),
  };
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await updateProtection({ db: prisma, staff }, field(form, "id"), values);
    return "Saved. The customer sees it now.";
  }, values);
  refresh();
  return result;
}

export async function addProtectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { organisationId: field(form, "organisationId"), label: field(form, "label"), reference: field(form, "reference") };
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await addProtection({ db: prisma, staff }, values);
    return "Added. Record its status once you have checked it.";
  }, values);
  refresh();
  return result;
}

export async function setRestoreStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await setRestoreStatus({ db: prisma, staff }, field(form, "id"), field(form, "status"));
    return "Updated.";
  });
  refresh();
  return result;
}

export async function syncBackupsAction(_prev: ActionState): Promise<ActionState> {
  const result = await run(async () => {
    await requireStaff();
    const r = await syncBackups({ db: prisma });
    return "skipped" in r ? "Manual mode, or the backup provider is off: there is nothing to fetch." : `Fetched status for ${r.updated} ${r.updated === 1 ? "backup" : "backups"}.`;
  });
  refresh();
  return result;
}
