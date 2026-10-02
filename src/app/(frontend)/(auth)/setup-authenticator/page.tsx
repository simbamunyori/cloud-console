import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { AuthShell } from "@/components/auth/auth-shell";
import { authDeps, currentSession, homeFor, readSessionToken } from "@/server/auth/next";
import { beginAuthenticatorSetup } from "@/server/auth/service";
import { groupSecret } from "@/server/auth/totp";
import { env } from "@/server/env";
import tokens from "@/config/theme/tokens.json";
import { rememberedNext } from "../shared";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Protect your account" };

export default async function SetupAuthenticatorPage() {
  const session = await currentSession();
  // Confirming setup signs the person in, and Next.js then re-renders this
  // page. Keep the same component in place so the backup codes stay on
  // screen; the form sends anyone else on to the app.
  const completed = session?.stage === "ACTIVE";
  if (!completed && session?.stage !== "SETUP_PENDING") redirect(homeFor(session));
  const setup = completed ? null : await beginAuthenticatorSetup(authDeps(), (await readSessionToken())!);
  const qrSvg = setup
    ? await QRCode.toString(setup.uri, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 0,
        color: { dark: tokens.brand.navy, light: tokens.brand.white },
      })
    : "";
  const isNewOrganisation = session!.user.lastLoginAt === null;

  return (
    <AuthShell>
      <SetupForm
        consoleName={env().CONSOLE_NAME}
        home={await rememberedNext()}
        eyebrow={isNewOrganisation ? "Step 2 of 2" : undefined}
        completed={completed}
        qrSvg={qrSvg}
        secret={setup ? groupSecret(setup.secret) : ""}
        otpauthUri={setup?.uri ?? ""}
      />
    </AuthShell>
  );
}
