"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWebsiteStaff } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { approveLinkedin, approvePage, retryDrafts, saveKit, startKit, FAQ_SLOTS } from "@/server/launch/kits";

const refresh = () => {
  revalidatePath("/admin/launch-kits", "layout");
  revalidatePath("/[market]", "layout");
};

export async function startKitAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const result = await run(async () => {
    await startKit(prisma, actor, field(form, "slug"));
    await runSoon("launch-kit-drafts").catch(() => undefined);
    return "Kit started. The first drafts follow in a few minutes.";
  });
  refresh();
  return result;
}

export async function saveKitAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const faq = Array.from({ length: FAQ_SLOTS }, (_, i) => ({ question: field(form, `question-${i}`), answer: field(form, `answer-${i}`) }));
  const result = await run(async () => {
    const { pageChanged, postChanged } = await saveKit(prisma, actor, field(form, "id"), { audience: field(form, "audience"), faq, linkedinText: field(form, "linkedinText") });
    if (!pageChanged && !postChanged) return "Nothing had changed.";
    return actor.websiteRole === "PUBLISHER" ? "Saved." : "Saved. A Publisher approves the changes before they go out.";
  });
  refresh();
  return result;
}

export async function approvePageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const approve = field(form, "approve") === "yes";
  const result = await run(async () => {
    await approvePage(prisma, actor, field(form, "id"), approve);
    return approve ? "The product page is on the website." : "The product page is off the website.";
  });
  refresh();
  return result;
}

export async function approveLinkedinAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { actor } = await requireWebsiteStaff();
  const result = await run(async () => {
    await approveLinkedin(prisma, actor, field(form, "id"));
    return "Approved. Copy the post and share it from the company page.";
  });
  refresh();
  return result;
}

export async function retryDraftsAction(form: FormData) {
  const { actor } = await requireWebsiteStaff();
  const id = field(form, "id");
  await retryDrafts(prisma, actor, id);
  await runSoon("launch-kit-drafts").catch(() => undefined);
  refresh();
  redirect(`/admin/launch-kits/${id}`);
}
