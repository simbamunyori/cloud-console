"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { formatMonth, parseDateOnly } from "@/lib/dates";
import { billingAdapter } from "@/server/billing";
import { billUsage } from "@/server/spend/billing";
import { importUsage, MAX_FILE_BYTES } from "@/server/spend/usage";

export async function importUsageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const file = form.get("file");
  return run(async () => {
    if (!(file instanceof File) || file.size === 0) throw new DomainError("invalid", "Choose the usage file to upload.", "file");
    if (file.size > MAX_FILE_BYTES) throw new DomainError("invalid", "That file is over 8 MB. Download one month at a time.", "file");
    const result = await importUsage({ db: prisma, staff }, file.name, await file.text());
    revalidatePath("/admin/cloud-usage");
    const head = `Imported ${result.rowsImported.toLocaleString("en")} of ${result.rowsRead.toLocaleString("en")} rows for ${result.customers} ${result.customers === 1 ? "customer" : "customers"}.`;
    return [head, ...result.notes].join(" ");
  });
}

export async function billUsageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const month = parseDateOnly(`${field(form, "month")}-01`);
  const result = await run(async () => {
    if (!month) throw new DomainError("invalid", "Choose a month to bill.");
    const { invoices, failed } = await billUsage({ db: prisma, adapter: billingAdapter(), staff }, month);
    const done = `Raised ${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"} for ${formatMonth(month)}.`;
    if (failed.length) throw new DomainError("conflict", `${done} Not billed: ${failed.map((f) => `${f.organisationName} (${f.reason})`).join("; ")}`);
    return done;
  });
  revalidatePath("/admin/cloud-usage");
  return result;
}
