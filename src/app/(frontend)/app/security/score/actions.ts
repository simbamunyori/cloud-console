"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { billingAdapter } from "@/server/billing";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { assertCan, DomainError } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { requireMember } from "@/server/org/context";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { refreshSecurityProfile } from "@/server/security/score-facts";
import { cleanDomain } from "@/server/tools/email-check";
import { emailCheckLookup } from "@/server/tools/lookup";

async function scoreAgain(organisationId: string) {
  try {
    await enforce(prisma, `securityRecheck:${organisationId}`, LIMITS.emailCheckPerIp);
  } catch (e) {
    if (e instanceof RateLimitedError) throw new DomainError("unavailable", "You've checked a lot just now. Try again in a few minutes.");
    throw e;
  }
  return refreshSecurityProfile({ db: prisma, adapter: billingAdapter(), lookup: emailCheckLookup() }, organisationId, { recheck: true });
}

/** The email domain we check, chosen by an Owner or Admin. Audited. */
export async function setEmailDomainAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { emailDomain: field(form, "emailDomain") };
  const result = await run(async () => {
    const { actor, organisation } = await requireMember();
    if (!(await featureOn(prisma, "security-score"))) throw new DomainError("not-found", "The security score isn't available yet.");
    assertCan(actor, "manageOrganisation");
    const domain = cleanDomain(values.emailDomain);
    if (!domain) throw new DomainError("invalid", "Enter a domain name, like yourcompany.co.bw.", "emailDomain");
    await prisma.$transaction(async (tx) => {
      await tx.securityProfile.upsert({ where: { organisationId: organisation.id }, create: { organisationId: organisation.id, emailDomain: domain }, update: { emailDomain: domain } });
      await audit(tx, customerAudit(actor, organisation.id, { action: "security.email-domain", summary: `Set the email domain for the security score to ${domain}` }));
    });
    const { score } = await scoreAgain(organisation.id);
    return `Checked ${domain}. Your score is ${score} out of 100.`;
  }, values);
  revalidatePath("/app/security/score");
  return result;
}

export async function rescoreAction(_prev: ActionState): Promise<ActionState> {
  const result = await run(async () => {
    const { organisation } = await requireMember();
    if (!(await featureOn(prisma, "security-score"))) throw new DomainError("not-found", "The security score isn't available yet.");
    const { score } = await scoreAgain(organisation.id);
    return `Checked again. Your score is ${score} out of 100.`;
  });
  revalidatePath("/app/security/score");
  revalidatePath("/app");
  return result;
}
