"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { ODOO_FILES, type OdooFile } from "@/server/migration/odoo";
import { approveImport, carryOn, chooseProducts, uploadExports } from "@/server/migration/run";
import { setCutover } from "@/server/migration/welcome";
import { DomainError } from "@/server/org/access";

const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadExportsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("migrateClients");
  return run(async () => {
    const uploads: { file: OdooFile; name: string; text: string }[] = [];
    for (const { key, label } of ODOO_FILES) {
      const file = form.get(key);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > MAX_BYTES) throw new DomainError("invalid", `The ${label.toLowerCase()} file is over 10 MB.`, key);
      uploads.push({ file: key, name: file.name, text: await file.text() });
    }
    if (!uploads.length) throw new DomainError("invalid", "Choose the exported files first.", "customers");
    await uploadExports({ db: prisma, staff }, uploads);
    revalidatePath("/admin/migration");
    return "Read the files. Nothing has been written yet: check the report below.";
  });
}

export async function chooseProductsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("migrateClients");
  return run(async () => {
    const choices: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      const m = /^name:(\d+)$/.exec(key);
      if (m && typeof value === "string") choices[value] = field(form, `product:${m[1]}`);
    }
    await chooseProducts({ db: prisma, staff }, field(form, "batchId"), choices);
    revalidatePath("/admin/migration");
    return "Worked the report out again with your choices.";
  });
}

export async function approveImportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("migrateClients");
  const result = await run(async () => {
    await approveImport({ db: prisma, staff }, field(form, "batchId"), field(form, "hash"));
  });
  if (result.ok) await runSoon("odoo-import");
  revalidatePath("/admin/migration");
  return result.ok ? { ok: true, message: "Approved. The import is running; refresh this page to follow it." } : result;
}

export async function carryOnAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("migrateClients");
  const result = await run(async () => {
    await carryOn({ db: prisma, staff }, field(form, "batchId"), field(form, "checked") === "yes");
  });
  if (result.ok) await runSoon("odoo-import");
  revalidatePath("/admin/migration");
  return result.ok ? { ok: true, message: "Carrying on. Refresh this page to follow it." } : result;
}

export async function setCutoverAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("migrateClients");
  return run(async () => {
    const value = field(form, "cutoverOn");
    await setCutover({ db: prisma, staff }, field(form, "batchId"), value);
    revalidatePath("/admin/migration");
    return value ? "Saved. The welcome emails go out that morning." : "Cleared. No welcome emails go out until you choose a date.";
  });
}
