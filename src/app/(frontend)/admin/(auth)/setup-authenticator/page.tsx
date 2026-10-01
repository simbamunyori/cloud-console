import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { staffConfirmSetupAction } from "@/app/(frontend)/(auth)/actions";
import { SetupForm } from "@/app/(frontend)/(auth)/setup-authenticator/setup-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { company } from "@/config/app";
import tokens from "@/config/theme/tokens.json";
import { authDeps, currentSession, readSessionToken, staffHomeFor } from "@/server/auth/next";
import { beginAuthenticatorSetup } from "@/server/auth/service";
import { groupSecret } from "@/server/auth/totp";
import { STAFF_POINTS } from "../points";

export const metadata: Metadata = { title: "Protect your account" };

export default async function StaffSetupPage() {
  const session = await currentSession("STAFF");
  const completed = session?.stage === "ACTIVE";
  if (!completed && session?.stage !== "SETUP_PENDING") redirect(staffHomeFor(session));
  const setup = completed ? null : await beginAuthenticatorSetup(authDeps(), (await readSessionToken("STAFF"))!);
  const qrSvg = setup ? await QRCode.toString(setup.uri, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: tokens.brand.navy, light: tokens.brand.white } }) : "";
  return (
    <AuthShell title={`${company.name} staff`} points={STAFF_POINTS}>
      <SetupForm
        consoleName="the staff console"
        home="/admin"
        action={staffConfirmSetupAction}
        audience="STAFF"
        completed={completed}
        qrSvg={qrSvg}
        secret={setup ? groupSecret(setup.secret) : ""}
        otpauthUri={setup?.uri ?? ""}
      />
    </AuthShell>
  );
}
