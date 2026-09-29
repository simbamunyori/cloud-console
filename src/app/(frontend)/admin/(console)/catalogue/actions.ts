"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { todayIn } from "@/lib/dates";
import { monthOf } from "@/lib/domain/pricing";
import { requireStaff } from "@/server/admin/context";
import { saveCategory, saveFamily, saveProduct, setInternalOrganisation } from "@/server/admin/catalogue";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter } from "@/server/billing";
import { linkStubProduct } from "@/server/billing/stub/catalogue";
import { StubBillingAdapter } from "@/server/billing/stub/stub-adapter";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { prisma } from "@/server/db";

async function deps() {
  const { staff } = await requireStaff();
  return { db: prisma, staff, month: monthOf(todayIn(DEFAULT_TIME_ZONE)) };
}

const values = (form: FormData, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, field(form, k)]));

const saved = (changed: number) => (changed ? `Saved ${changed} ${changed === 1 ? "change" : "changes"}.` : "Nothing had changed.");

const FAMILY_FIELDS = ["key", "name", "description", "connector", "status", "sortOrder"] as const;

export async function saveFamilyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const existing = field(form, "existing") || undefined;
  const v = values(form, FAMILY_FIELDS);
  let created: string | null = null;
  const result = await run(async () => {
    const { key, changed } = await saveFamily(await deps(), v as never, existing);
    if (!existing) created = key;
    return saved(changed);
  }, v);
  revalidatePath("/admin/catalogue", "layout");
  if (created) redirect(`/admin/catalogue/families/${created}?added=1`);
  return result;
}

const CATEGORY_FIELDS = ["key", "name", "description", "familyKey", "sortOrder", "margin"] as const;

export async function saveCategoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const existing = field(form, "existing") || undefined;
  const v = values(form, CATEGORY_FIELDS);
  let created: string | null = null;
  const result = await run(async () => {
    const { key, changed } = await saveCategory(await deps(), v as never, existing);
    if (!existing) created = key;
    return saved(changed);
  }, v);
  revalidatePath("/admin/catalogue", "layout");
  if (created) redirect(`/admin/catalogue/categories/${created}?added=1`);
  return result;
}

const PRODUCT_FIELDS = [
  "slug",
  "name",
  "summary",
  "includes",
  "excludes",
  "categoryKey",
  "unitLabel",
  "minQuantity",
  "setupHours",
  "minTermMonths",
  "commitmentNote",
  "cost",
  "costCurrency",
  "fixedPrice",
  "fixedPriceCurrency",
  "fulfilment",
  "status",
  "sortOrder",
] as const;

export async function saveProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const existing = field(form, "existing") || undefined;
  const v = values(form, PRODUCT_FIELDS);
  const markets = form.getAll("markets").filter((m): m is string => typeof m === "string");
  const quantityAllowed = form.get("quantityAllowed") === "on";
  let created: string | null = null;
  const result = await run(
    async () => {
      const { slug, changed } = await saveProduct(await deps(), { ...(v as Record<(typeof PRODUCT_FIELDS)[number], string>), markets, quantityAllowed }, existing);
      // WHMCS gets new products from the product sync; the stub gets them here.
      if (billingAdapter() instanceof StubBillingAdapter) await linkStubProduct(prisma, slug);
      if (!existing) created = slug;
      return saved(changed);
    },
    { ...v, markets: markets.join(","), quantityAllowed: quantityAllowed ? "on" : "" },
  );
  revalidatePath("/admin/catalogue", "layout");
  revalidatePath("/admin/pricing");
  if (created) redirect(`/admin/catalogue/products/${created}?added=1`);
  return result;
}

export async function setInternalOrganisationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const organisationId = field(form, "organisationId");
  const internal = field(form, "internal") === "true";
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await setInternalOrganisation({ db: prisma, staff }, organisationId, internal);
    return internal ? "Now one of our test organisations. Its team sees internal products." : "Now an ordinary customer. Internal products are hidden from it.";
  });
  revalidatePath(`/admin/customers/${organisationId}`);
  return result;
}
