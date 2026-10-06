"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { savePartnerRecord, type PartnerRecordInput } from "@/server/units/partner-register";

const KEYS = ["name", "category", "status", "contacts", "agreementRef", "agreementUrl", "startsOn", "renewsOn", "noticeDays", "products", "notes"] as const;

export async function savePartnerRecordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "id") || null;
  const values = Object.fromEntries(KEYS.map((k) => [k, field(form, k)])) as unknown as PartnerRecordInput;
  const result = await run(async () => {
    const { staff } = await requireStaff();
    const saved = await savePartnerRecord({ db: prisma, staff }, id, values);
    return id ? `${saved.name} saved.` : `${saved.name} added.`;
  }, values as unknown as Record<string, string>);
  if (result.ok) revalidatePath("/admin/partner-register");
  return result;
}
