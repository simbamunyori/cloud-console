import { redirect } from "next/navigation";
import { currentSession, homeFor } from "@/server/auth/next";

/** The console has no public home page: send people to sign in or to their console. */
export default async function Root() {
  redirect(homeFor(await currentSession()));
}
