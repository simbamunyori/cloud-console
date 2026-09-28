"use server";

import { revalidatePath } from "next/cache";
import { authDeps, requestContext, requireActiveSession } from "@/server/auth/next";
import { AuthError, regenerateRecoveryCodes, signOutEverywhere } from "@/server/auth/service";
import { field } from "@/server/action-state";

export interface CodesState {
  error?: string;
  codes?: string[];
  attempt?: number;
}

export async function newBackupCodesAction(_prev: CodesState, form: FormData): Promise<CodesState> {
  const session = await requireActiveSession();
  try {
    const codes = await regenerateRecoveryCodes(authDeps(), session, field(form, "code"), await requestContext());
    return { codes };
  } catch (e) {
    if (e instanceof AuthError) {
      return { attempt: Date.now(), error: e.code === "locked" ? "Too many wrong codes. Try again in 15 minutes." : "That code didn't work. Use the one showing now." };
    }
    throw e;
  }
}

export async function signOutOthersAction(): Promise<void> {
  const session = await requireActiveSession();
  await signOutEverywhere(authDeps(), session.userId, session.id);
  revalidatePath("/app/security");
}
