"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter } from "@/server/billing";
import { StubBillingAdapter } from "@/server/billing/stub/stub-adapter";
import { prisma } from "@/server/db";
import { setDefaultMarket, setMarketEnabled, updateMarketSettings } from "@/server/markets/markets";
import { changeOrganisationMarket } from "@/server/markets/organisation-market";
import { syncStubTaxRules } from "@/server/markets/tax-sync";
import { markContacted } from "@/server/markets/waitlist";

async function deps() {
  const { staff } = await requireStaff();
  return { db: prisma, staff };
}

/** The stub charges tax from rules kept in step with market settings; WHMCS is set up to match by hand. */
async function syncTax() {
  if (billingAdapter() instanceof StubBillingAdapter) await syncStubTaxRules(prisma);
}

const FIELDS = [
  "name",
  "countries",
  "currency",
  "locale",
  "timeZone",
  "taxRatePercent",
  "taxDisplay",
  "taxLabel",
  "taxRegistrationNumber",
  "eftBankName",
  "eftAccountName",
  "eftAccountNumber",
  "eftBranchCode",
  "eftSwiftCode",
  "supportEmail",
  "supportPhone",
  "supportHours",
  "highlightedTlds",
  "dataProtectionLaw",
] as const;

export async function saveMarketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(FIELDS.map((f) => [f, field(form, f)])) as Record<(typeof FIELDS)[number], string>;
  const code = field(form, "code");
  const result = await run(async () => {
    const changed = await updateMarketSettings(await deps(), code, {
      ...values,
      taxDisplay: values.taxDisplay as "INCLUSIVE" | "EXCLUSIVE",
      taxEnabled: form.get("taxEnabled") === "on",
      paymentMethods: form.getAll("paymentMethods").filter((v): v is "card" | "eft" => v === "card" || v === "eft"),
    });
    await syncTax();
    return changed.length ? `Saved ${changed.length} ${changed.length === 1 ? "change" : "changes"}.` : "Nothing had changed.";
  }, values);
  revalidatePath("/admin/markets", "layout");
  return result;
}

export async function setMarketEnabledAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const enabled = field(form, "enabled") === "true";
  const result = await run(async () => {
    await setMarketEnabled(await deps(), field(form, "code"), enabled);
    await syncTax();
    return enabled ? "Switched on. New customers in its countries can sign up." : "Switched off. Its customers keep their accounts; new sign-ups go to the waiting list.";
  });
  revalidatePath("/admin/markets", "layout");
  return result;
}

export async function setDefaultMarketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    await setDefaultMarket(await deps(), field(form, "code"));
    return "Now the default market.";
  });
  revalidatePath("/admin/markets", "layout");
  return result;
}

export async function changeOrganisationMarketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await changeOrganisationMarket({ db: prisma, adapter: billingAdapter(), staff }, organisationId, field(form, "market"));
    return "Moved. The customer can see this in their activity log.";
  });
  revalidatePath(`/admin/customers/${organisationId}`);
  return result;
}

export async function markContactedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await markContacted(prisma, staff, field(form, "id"));
    return "Marked as contacted.";
  });
  revalidatePath("/admin/waitlist");
  revalidatePath("/admin", "layout");
  return result;
}
