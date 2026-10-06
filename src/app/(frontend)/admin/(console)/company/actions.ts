"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { saveBankAccount, saveCompany, saveLogo, type LogoKind } from "@/server/company/company";
import { companyPusher } from "@/server/billing";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";

async function deps() {
  const { staff } = await requireStaffCan("manageCompany");
  return { db: prisma, staff };
}

const COMPANY_FIELDS = ["legalName", "tradingName", "registrationNumber", "address", "phone", "email", "website", "invoiceFooter", "paymentTerms", "quoteTerms"] as const;
const BANK_FIELDS = ["marketCode", "currency", "bankName", "branchName", "accountName", "accountNumber", "branchCode", "swiftCode"] as const;

export async function saveCompanyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(COMPANY_FIELDS.map((f) => [f, field(form, f)])) as Record<(typeof COMPANY_FIELDS)[number], string>;
  const result = await run(async () => {
    const changed = await saveCompany(await deps(), values);
    return changed.length ? `Saved: ${changed.join(", ")}. Invoices, quotes and emails use it from now on.` : "Nothing had changed.";
  }, values);
  revalidatePath("/", "layout");
  return result;
}

export async function saveLogoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const kind: LogoKind = field(form, "kind") === "dark" ? "dark" : "light";
  const reset = field(form, "reset") === "true";
  const result = await run(async () => {
    const file = form.get(`logo-${kind}`);
    let bytes: Uint8Array | null = null;
    if (!reset) {
      if (!(file instanceof File) || file.size === 0) throw new DomainError("invalid", "Choose a PNG file.", `logo-${kind}`);
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    await saveLogo(await deps(), kind, bytes);
    return reset ? "Back to the standard logo." : "Logo uploaded.";
  });
  revalidatePath("/admin/company");
  return result;
}

export async function saveBankAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(BANK_FIELDS.map((f) => [f, field(form, f)])) as Record<(typeof BANK_FIELDS)[number], string>;
  const result = await run(async () => {
    await saveBankAccount(await deps(), values);
    return "Bank account saved. Invoices in that market and currency show it from now on.";
  }, values);
  revalidatePath("/admin/company");
  revalidatePath("/admin/markets", "layout");
  return result;
}

export async function pushCompanyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const apply = field(form, "apply") === "true";
  const { staff } = await requireStaffCan("manageCompany");
  const push = companyPusher();
  if (!push) return { error: "Billing runs on the built-in stub here, so there is no WHMCS to send to." };
  try {
    const result = await push(staff, apply);
    const lines = [
      result.changes.length ? `${apply ? "Changed" : "Would change"}: ${result.changes.join("; ")}.` : "WHMCS already matches.",
      ...result.warnings.map((w) => `Note: ${w}.`),
    ];
    return { ok: true, message: lines.join(" ") };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
