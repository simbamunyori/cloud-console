"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, run, type ActionState } from "@/server/action-state";
import { requireBilling } from "@/server/billing/context";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { runSoon } from "@/server/jobs/boss";
import { DomainError } from "@/server/org/access";
import { ask, confirmAction, declineAction } from "@/server/support/assistant/assistant";
import { assistantModel } from "@/server/support/assistant/model";
import { customerReply, customerResolve, openTicket } from "@/server/support/tickets";

async function deps() {
  const { db, billing, organisation, actor } = await requireBilling();
  return { prisma, db, billing, organisation, actor };
}

export async function openTicketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { subject: field(form, "subject"), body: field(form, "body"), service: field(form, "service") };
  let reference = "";
  const result = await run(async () => {
    const d = await deps();
    const service = values.service ? await d.billing.getService(values.service) : null;
    reference = (await openTicket(d, { subject: values.subject, body: values.body, serviceName: service ? `${service.name}${service.domain ? ` (${service.domain})` : ""}` : undefined })).reference;
  }, values);
  if (!result.ok) return result;
  redirect(`/app/support/tickets/${reference}?new=1`);
}

export async function replyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const reference = field(form, "reference");
  const values = { body: field(form, "body") };
  const result = await run(async () => {
    await customerReply(await deps(), reference, values.body);
    return "Sent.";
  }, values);
  if (result.ok) revalidatePath(`/app/support/tickets/${reference}`);
  return result;
}

export async function resolveAction(form: FormData) {
  const reference = field(form, "reference");
  await customerResolve(await deps(), reference);
  revalidatePath(`/app/support/tickets/${reference}`);
}

export async function askAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { question: field(form, "question") };
  const conversationId = field(form, "conversationId") || undefined;
  let id = "";
  const result = await run(async () => {
    const d = await deps();
    id = (await ask({ ...d, model: assistantModel(), consoleName: env().CONSOLE_NAME }, { question: values.question, conversationId })).conversationId;
  }, values);
  if (!result.ok) return result;
  redirect(`/app/support/assistant?c=${id}#latest`);
}

export async function decideAction(form: FormData) {
  const actionId = field(form, "actionId");
  const conversationId = field(form, "conversationId");
  const d = await deps();
  let note = "";
  try {
    if (field(form, "decision") === "confirm") {
      const { result } = await confirmAction(d, actionId);
      await runSoon("email-deliver").catch(() => undefined);
      if ("ticketReference" in result) redirect(`/app/support/tickets/${result.ticketReference}?handover=1`);
      note = "done";
    } else {
      await declineAction(d, actionId);
    }
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    note = "failed";
  }
  redirect(`/app/support/assistant?c=${conversationId}${note ? `&action=${note}` : ""}#latest`);
}
