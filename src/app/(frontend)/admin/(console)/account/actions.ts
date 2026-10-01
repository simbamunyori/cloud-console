"use server";

import { revalidatePath } from "next/cache";
import { field } from "@/server/action-state";
import { authDeps, requestContext, requireActiveStaffSession, requireRecentCheck } from "@/server/auth/next";
import { removePasskey, renamePasskey } from "@/server/auth/passkeys";
import { AuthError } from "@/server/auth/service";
import { runSoon } from "@/server/jobs/boss";

interface MethodState {
  error?: string;
  message?: string;
}

export async function staffRemovePasskeyAction(_prev: MethodState, form: FormData): Promise<MethodState> {
  const session = await requireActiveStaffSession();
  await requireRecentCheck(session, "STAFF", "/admin/account");
  try {
    await removePasskey(authDeps(), session, field(form, "passkeyId"), await requestContext());
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await runSoon("email-deliver").catch(() => undefined);
  revalidatePath("/admin/account");
  return { message: "Passkey removed." };
}

export async function staffRenamePasskeyAction(_prev: MethodState, form: FormData): Promise<MethodState> {
  const session = await requireActiveStaffSession();
  try {
    await renamePasskey(authDeps(), session, field(form, "passkeyId"), field(form, "name"));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/account");
  return { message: "Renamed." };
}
