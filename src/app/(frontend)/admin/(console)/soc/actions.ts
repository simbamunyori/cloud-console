"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { createIncident, escalateIncident, removeDevice, saveDevice, saveSocReport, saveSocSettings, saveTenant, updateIncident } from "@/server/soc/soc";
import { saveProvider, setProviderActive, testProvider } from "@/server/soc/providers";

const deps = async () => ({ db: prisma, staff: (await requireStaff()).staff });
const pick = (form: FormData, names: string[]) => Object.fromEntries(names.map((n) => [n, field(form, n)]));
const refresh = (...paths: string[]) => {
  for (const p of ["/admin/soc", ...paths]) revalidatePath(p);
};

export async function createIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["organisationId", "title", "summary", "severity", "deviceName"]) as Parameters<typeof createIncident>[1];
  const result = await run(async () => {
    const i = await createIncident(await deps(), values);
    return `Opened ${i.reference}.`;
  }, values);
  refresh();
  return result;
}

export async function updateIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["status", "ourAction", "note", "assigneeId"]);
  const reference = field(form, "reference");
  const result = await run(async () => {
    await updateIncident(await deps(), field(form, "id"), { ...values, notify: field(form, "notify") === "on" });
    return field(form, "notify") === "on" ? "Saved, and the customer has been emailed." : "Saved.";
  }, values);
  refresh(`/admin/soc/${reference}`);
  return result;
}

export async function escalateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const reference = field(form, "reference");
  const result = await run(async () => {
    await escalateIncident(await deps(), field(form, "id"), field(form, "why"));
    return "Escalated.";
  });
  refresh(`/admin/soc/${reference}`);
  return result;
}

export async function saveSocSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["critical", "high", "medium", "low", "escalationEmail"]) as Parameters<typeof saveSocSettings>[1];
  const result = await run(async () => {
    await saveSocSettings(await deps(), values);
    return "Saved.";
  }, values);
  refresh();
  return result;
}

export async function saveTenantAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["tenantRef", "status", "enrolmentLink", "enrolmentNote"]) as Parameters<typeof saveTenant>[2];
  const id = field(form, "organisationId");
  const result = await run(async () => {
    await saveTenant(await deps(), id, values);
    return "Saved. The customer sees it now.";
  }, values);
  refresh(`/admin/soc/customers/${id}`);
  return result;
}

export async function saveDeviceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["name", "os", "health", "lastSeenAt"]) as Parameters<typeof saveDevice>[2];
  const id = field(form, "organisationId");
  const result = await run(async () => {
    await saveDevice(await deps(), id, { ...values, id: field(form, "deviceId") || undefined });
    return "Saved.";
  }, values);
  refresh(`/admin/soc/customers/${id}`);
  return result;
}

export async function removeDeviceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "organisationId");
  const result = await run(async () => {
    await removeDevice(await deps(), id, field(form, "deviceId"));
    return "Removed.";
  });
  refresh(`/admin/soc/customers/${id}`);
  return result;
}

export async function saveSocReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["month", "title", "summary", "url"]) as Parameters<typeof saveSocReport>[2];
  const id = field(form, "organisationId");
  const result = await run(async () => {
    await saveSocReport(await deps(), id, values);
    return "Saved. The customer sees it now.";
  }, values);
  refresh(`/admin/soc/customers/${id}`);
  return result;
}

// Admin > Partners > Security provider

export async function saveProviderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = pick(form, ["type", "name", "endpoint", "tenantSettings", "customFields"]);
  const secrets = pick(form, ["apiKey", "apiSecret", "webhookSecret"]);
  const result = await run(async () => {
    await saveProvider(await deps(), field(form, "id") || null, { ...(values as { type: string; name: string; endpoint: string; tenantSettings: string; customFields: string }), ...(secrets as { apiKey: string; apiSecret: string; webhookSecret: string }) });
    return "Saved. Test the connection before making it active.";
  }, values);
  revalidatePath("/admin/partners/security");
  return result;
}

export async function testProviderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { ok, message } = await testProvider(await deps(), field(form, "id"));
    if (!ok) throw new DomainError("invalid", message);
    return message;
  });
  revalidatePath("/admin/partners/security");
  return result;
}

export async function setProviderActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const active = field(form, "active") === "true";
  const result = await run(async () => {
    await setProviderActive(await deps(), field(form, "id"), active);
    return active ? "Now the active provider. Turn on Managed security in Features when the agreement is signed." : "Switched off. Managed security is off too.";
  });
  revalidatePath("/admin/partners/security");
  return result;
}
