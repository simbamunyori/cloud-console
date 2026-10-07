"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, run, type ActionState } from "@/server/action-state";
import { requireRecentCheck } from "@/server/auth/next";
import { requireBilling } from "@/server/billing/context";
import { changeContact, changeNameservers, parseDnsRecords, renewDomain, saveDns, transferOutCode } from "@/server/domains/manage";

async function deps() {
  const { db, billing, organisation, actor, session } = await requireBilling();
  return { deps: { db, billing, organisation, actor }, session };
}

const page = (id: string) => `/app/services/domains/${encodeURIComponent(id)}`;

export async function renewDomainAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "domainId");
  let invoiceId: string | undefined;
  const result = await run(async () => {
    const placed = await renewDomain((await deps()).deps, id, field(form, "years"));
    invoiceId = placed.invoiceId;
  });
  if (!result.ok) return result;
  revalidatePath(page(id));
  if (invoiceId) redirect(`/app/billing/invoices/${encodeURIComponent(invoiceId)}`);
  return { ok: true, message: "Renewal ordered. It goes through once the invoice is paid." };
}

export async function nameserversAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "domainId");
  const values = { nameservers: field(form, "nameservers") };
  const { deps: d, session } = await deps();
  await requireRecentCheck(session, "CUSTOMER", page(id));
  const result = await run(async () => {
    const list = await changeNameservers(d, id, values.nameservers);
    return `Saved. ${list.length === 1 ? "The new nameserver takes" : "New nameservers take"} effect within a few hours.`;
  }, values);
  revalidatePath(page(id));
  return result;
}

export async function dnsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "domainId");
  const count = Math.min(Number(field(form, "rows")) || 0, 120);
  const rows = Array.from({ length: count }, (_, i) => ({
    type: field(form, `type-${i}`),
    name: field(form, `name-${i}`),
    value: field(form, `value-${i}`),
    ttl: field(form, `ttl-${i}`),
    priority: field(form, `priority-${i}`),
  }));
  const values = Object.fromEntries(rows.flatMap((r, i) => Object.entries(r).map(([k, v]) => [`${k}-${i}`, v])));
  const { deps: d } = await deps();
  const result = await run(async () => {
    const records = parseDnsRecords(rows);
    await saveDns(d, id, records);
    return `Saved ${records.length} ${records.length === 1 ? "record" : "records"}. Changes take effect within an hour.`;
  }, values);
  revalidatePath(page(id));
  return result;
}

const CONTACT_FIELDS = ["firstName", "lastName", "companyName", "email", "phone", "address", "city", "postcode", "country"] as const;

export async function contactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "domainId");
  const values = Object.fromEntries(CONTACT_FIELDS.map((f) => [f, field(form, f)])) as Record<(typeof CONTACT_FIELDS)[number], string>;
  const { deps: d, session } = await deps();
  await requireRecentCheck(session, "CUSTOMER", page(id));
  const result = await run(async () => {
    await changeContact(d, id, { ...values, companyName: values.companyName || undefined, postcode: values.postcode || undefined });
    return "Saved. The registry may email the old and new addresses to confirm.";
  }, values);
  revalidatePath(page(id));
  return result;
}

export async function transferCodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = field(form, "domainId");
  const { deps: d, session } = await deps();
  await requireRecentCheck(session, "CUSTOMER", page(id));
  return run(() => transferOutCode(d, id));
}
