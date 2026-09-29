"use server";

import { redirect } from "next/navigation";
import { authDeps, currentSession } from "@/server/auth/next";
import { AuthError, switchOrganisation } from "@/server/auth/service";

export async function switchOrganisationAction(form: FormData): Promise<void> {
  const session = await currentSession();
  if (session?.stage !== "ACTIVE") redirect("/sign-in?expired=1");
  const id = form.get("organisationId");
  try {
    await switchOrganisation(authDeps(), session, typeof id === "string" ? id : "");
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
  }
  redirect("/app");
}
