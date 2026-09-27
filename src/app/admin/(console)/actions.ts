"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { todayIn } from "@/lib/dates";
import { monthOf } from "@/lib/domain/pricing";
import { requireStaff } from "@/server/admin/context";
import { setCategoryMargin, setCurrencyBuffer, setNextMonthRate } from "@/server/admin/pricing";
import { completeTask, startTask } from "@/server/admin/tasks";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter } from "@/server/billing";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { confirmEftPayment, rejectEftPayment } from "@/server/payments/eft";
import { staffReply } from "@/server/support/tickets";

async function deps() {
  const { staff } = await requireStaff();
  return { db: prisma, adapter: billingAdapter(), staff };
}

const sendEmails = () => runSoon("email-deliver").catch(() => undefined);

export async function startTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    await startTask(await deps(), field(form, "taskId"));
    return "It's yours.";
  });
  revalidatePath("/admin/tasks");
  return result;
}

export async function completeTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { note: field(form, "note") };
  const result = await run(async () => {
    const done = await completeTask(await deps(), field(form, "taskId"), values);
    return done.orderReady ? "Done. The order is live and the customer has been emailed." : "Done. Other tasks on this order are still open.";
  }, values);
  if (result.ok) {
    await sendEmails();
    revalidatePath("/admin", "layout");
  }
  return result;
}

export async function confirmEftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { amountReceived: field(form, "amountReceived") };
  const result = await run(async () => {
    await confirmEftPayment(await deps(), field(form, "eftPaymentId"), values);
    return "Confirmed. The invoice is updated and the customer has been emailed.";
  }, values);
  if (result.ok) {
    await sendEmails();
    revalidatePath("/admin", "layout");
  }
  return result;
}

export async function rejectEftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { note: field(form, "note") };
  const result = await run(async () => {
    await rejectEftPayment(await deps(), field(form, "eftPaymentId"), values.note);
    return "The customer has been told we couldn't find it.";
  }, values);
  if (result.ok) {
    await sendEmails();
    revalidatePath("/admin", "layout");
  }
  return result;
}

async function pricingDeps() {
  const { staff } = await requireStaff();
  return { db: prisma, staff, month: monthOf(todayIn(DEFAULT_TIME_ZONE)) };
}

export async function setMarginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { margin: field(form, "margin") };
  const result = await run(async () => {
    await setCategoryMargin(await pricingDeps(), field(form, "categoryKey"), values.margin);
    return "Saved. New prices apply from next month.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function setBufferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { buffer: field(form, "buffer") };
  const result = await run(async () => {
    await setCurrencyBuffer(await pricingDeps(), values.buffer);
    return "Saved. New prices apply from next month.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function setRateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { rate: field(form, "rate") };
  const result = await run(async () => {
    await setNextMonthRate(await pricingDeps(), field(form, "base"), field(form, "quote"), values.rate);
    return "Saved for next month.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function staffReplyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const reference = field(form, "reference");
  const values = { body: field(form, "body") };
  const internal = field(form, "internal") === "on";
  const status = field(form, "status") as "OPEN" | "WAITING_ON_CUSTOMER" | "RESOLVED";
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await staffReply({ db: prisma, staff }, reference, { body: values.body, internal, status: ["OPEN", "WAITING_ON_CUSTOMER", "RESOLVED"].includes(status) ? status : undefined });
    return internal ? "Note added." : "Reply sent. The customer has been emailed.";
  }, values);
  if (result.ok) {
    await sendEmails();
    revalidatePath(`/admin/tickets/${reference}`);
  }
  return result;
}
