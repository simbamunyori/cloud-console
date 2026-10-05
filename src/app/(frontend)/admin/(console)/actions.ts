"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMonth, todayIn } from "@/lib/dates";
import { monthOf } from "@/lib/domain/pricing";
import { requireStaff } from "@/server/admin/context";
import { setAutoApprove, setCategoryMargin, setCurrencyBuffer, setNextMonthRate } from "@/server/admin/pricing";
import { completeTask, startTask } from "@/server/admin/tasks";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter, priceSyncer } from "@/server/billing";
import { approveAllSuggestions, approvePrice, setOffered } from "@/server/catalogue/price-book";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { confirmEftPayment, rejectEftPayment } from "@/server/payments/eft";
import { approveRun } from "@/server/pricing/monthly";
import { acceptTable } from "@/server/pricing/official-rates";
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
    if (!done.task.orderId) return done.task.kind === "licence_change" ? "Done. The customer sees the change now." : "Done.";
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
    return "Saved. The suggestions are updated; approve them in each market to change prices.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function setBufferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { buffer: field(form, "buffer") };
  const result = await run(async () => {
    await setCurrencyBuffer(await pricingDeps(), values.buffer);
    return "Saved. The suggestions are updated; approve them in each market to change prices.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function setRateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { rate: field(form, "rate") };
  const result = await run(async () => {
    await setNextMonthRate(await pricingDeps(), field(form, "base"), field(form, "quote"), values.rate);
    return "Saved for next month. The suggestions are updated.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function setAutoApproveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { threshold: field(form, "threshold") };
  const result = await run(async () => {
    await setAutoApprove(await pricingDeps(), values.threshold);
    return "Saved. It applies from the next monthly price book.";
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function acceptRatesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const { staff } = await requireStaff();
    await acceptTable({ db: prisma, staff }, field(form, "tableId"));
    // Accepting can raise a buffer alert.
    await sendEmails();
    return "Accepted. These rates are now in use.";
  }, {});
  revalidatePath("/admin/pricing");
  return result;
}

export async function approveMonthAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const month = field(form, "month");
  const result = await run(async () => {
    const { staff } = await requireStaff();
    const done = await approveRun({ db: prisma, staff, sync: priceSyncer() }, month);
    return done.syncError ? `Approved. The prices are in effect here, but WHMCS didn't take them: ${done.syncError}` : "Approved. The prices are in effect and sent to billing.";
  }, {});
  revalidatePath("/admin/pricing");
  revalidatePath(`/admin/pricing/months/${month}`);
  return result;
}

export async function approvePriceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { amount: field(form, "amount"), renew: field(form, "renew") };
  const result = await run(async () => {
    const entry = await approvePrice(await pricingDeps(), field(form, "market"), field(form, "item"), values);
    return `Approved from ${formatMonth(new Date(`${entry.month}-01T00:00:00Z`))}.`;
  }, values);
  revalidatePath("/admin/pricing");
  return result;
}

export async function approveAllAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const count = await approveAllSuggestions(await pricingDeps(), field(form, "market"));
    return count ? `Approved ${count} ${count === 1 ? "price" : "prices"}.` : "Nothing to approve: every suggestion is already approved.";
  }, {});
  revalidatePath("/admin/pricing");
  return result;
}

export async function setOfferedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const offered = field(form, "offered") === "true";
  const result = await run(async () => {
    await setOffered(await pricingDeps(), field(form, "market"), field(form, "item"), offered);
    return offered ? "Offered" : "Withdrawn";
  }, {});
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
