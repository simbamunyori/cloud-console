"use server";

import { revalidatePath } from "next/cache";
import type { IdentityProvider } from "@prisma/client";
import { unlinkIdentity } from "@/server/auth/identities";
import { authDeps, requestContext, requireActiveSession, requireRecentCheck } from "@/server/auth/next";
import { removePasskey, renamePasskey } from "@/server/auth/passkeys";
import { AuthError, regenerateRecoveryCodes, replaceRecoveryCodes, signOutEverywhere } from "@/server/auth/service";
import { runSoon } from "@/server/jobs/boss";
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

/** For people whose second step is a passkey: new codes after the recent check. */
export async function replaceBackupCodesAction(_prev: CodesState): Promise<CodesState> {
  const session = await requireActiveSession();
  await requireRecentCheck(session, "CUSTOMER", "/app/security");
  return { codes: await replaceRecoveryCodes(authDeps(), session, await requestContext()) };
}

export interface MethodState {
  error?: string;
  message?: string;
}

async function change(work: (session: Awaited<ReturnType<typeof requireActiveSession>>) => Promise<void>, message: string): Promise<MethodState> {
  const session = await requireActiveSession();
  await requireRecentCheck(session, "CUSTOMER", "/app/security");
  try {
    await work(session);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await runSoon("email-deliver").catch(() => undefined);
  revalidatePath("/app/security");
  return { message };
}

export async function removePasskeyAction(_prev: MethodState, form: FormData): Promise<MethodState> {
  return change(async (session) => removePasskey(authDeps(), session, field(form, "passkeyId"), await requestContext()), "Passkey removed.");
}

export async function renamePasskeyAction(_prev: MethodState, form: FormData): Promise<MethodState> {
  const session = await requireActiveSession();
  try {
    await renamePasskey(authDeps(), session, field(form, "passkeyId"), field(form, "name"));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  revalidatePath("/app/security");
  return { message: "Renamed." };
}

export async function unlinkAction(_prev: MethodState, form: FormData): Promise<MethodState> {
  const provider = field(form, "provider") as IdentityProvider;
  if (provider !== "MICROSOFT" && provider !== "GOOGLE") return { error: "Choose an account." };
  return change(async (session) => unlinkIdentity(authDeps(), session, provider, await requestContext()), "Disconnected.");
}
