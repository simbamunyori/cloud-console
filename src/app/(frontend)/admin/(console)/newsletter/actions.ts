"use server";

import { revalidatePath } from "next/cache";
import { requireWebsiteStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { prepareIssues, refreshIssue, saveIssue, sendIssue } from "@/server/newsletter/issues";
import { cms } from "@/server/site/cms";

const refresh = () => revalidatePath("/admin/newsletter", "layout");

export async function prepareIssuesAction(_prev: ActionState): Promise<ActionState> {
  await requireWebsiteStaff();
  const result = await run(async () => {
    const n = await prepareIssues({ db: prisma, payload: await cms() });
    return n ? `Prepared ${n} ${n === 1 ? "issue" : "issues"}.` : "Nothing new to prepare: last month's issues are here already, or nothing was published last month.";
  });
  refresh();
  return result;
}

export async function saveIssueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const values = { subject: field(form, "subject"), intro: field(form, "intro") };
  const result = await run(async () => {
    await saveIssue(prisma, actor, field(form, "id"), values);
    return "Saved.";
  }, values);
  refresh();
  return result;
}

export async function refreshIssueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const result = await run(async () => {
    const n = await refreshIssue(prisma, await cms(), actor, field(form, "id"));
    return `The issue now has ${n} ${n === 1 ? "article" : "articles"}.`;
  });
  refresh();
  return result;
}

export async function sendIssueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const result = await run(async () => {
    const n = await sendIssue(prisma, actor, field(form, "id"));
    await runSoon("email-deliver").catch(() => undefined);
    return `Sent to ${n} ${n === 1 ? "subscriber" : "subscribers"}.`;
  });
  refresh();
  return result;
}
