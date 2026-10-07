"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { syncDomainCosts } from "@/server/domains/costs";
import { DomainError } from "@/server/org/access";
import { isPartnerKey, PARTNERS, partnerConfig, registrarFrom, savePartner, setPartnerEnabled, testPartner } from "@/server/partners/partners";

async function deps() {
  const { staff } = await requireStaffCan("managePartners");
  return { db: prisma, staff };
}

function refresh(key: string) {
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${key}`);
  revalidatePath("/admin/features");
}

export async function savePartnerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const key = field(form, "key");
  const fields = isPartnerKey(key) ? PARTNERS[key].fields : [];
  const input = Object.fromEntries(fields.map((f) => [f.name, field(form, f.name)]));
  // Secrets are never sent back to the form.
  const values = Object.fromEntries(fields.filter((f) => !f.secret).map((f) => [f.name, input[f.name]]));
  const result = await run(async () => {
    const changed = await savePartner(await deps(), key, input);
    return changed.length ? `Saved ${changed.length} ${changed.length === 1 ? "change" : "changes"}. Run Test connection before switching it on.` : "Nothing had changed.";
  }, values);
  refresh(key);
  return result;
}

export async function testPartnerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const key = field(form, "key");
  const result = await run(async () => {
    const { ok, message } = await testPartner(await deps(), key);
    if (!ok) throw new DomainError("invalid", message);
    return message;
  });
  refresh(key);
  return result;
}

export async function setPartnerEnabledAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const key = field(form, "key");
  const enabled = field(form, "enabled") === "true";
  const result = await run(async () => {
    await setPartnerEnabled(await deps(), key, enabled);
    return enabled ? "Switched on. Turn on its feature in Features when you are ready for customers to use it." : "Switched off. Its feature is off too.";
  });
  refresh(key);
  return result;
}

export async function fetchDomainCostsAction(_prev: ActionState): Promise<ActionState> {
  const result = await run(async () => {
    const { db, staff } = await deps();
    const config = await partnerConfig(db, "openprovider");
    if (!config?.enabled) throw new DomainError("conflict", "Switch Openprovider on first.");
    const synced = await syncDomainCosts({ db, registrar: registrarFrom(config), staff });
    if (!synced) throw new DomainError("conflict", "Openprovider gave no prices.");
    const parts = [`${synced.updated.length} changed`, `${synced.unchanged.length} unchanged`];
    if (synced.missing.length) parts.push(`no price for ${synced.missing.join(", ")}`);
    return `Costs fetched: ${parts.join(", ")}. Selling prices follow at the next price book.`;
  });
  revalidatePath("/admin/partners/openprovider");
  revalidatePath("/admin/pricing");
  return result;
}
