import type { IdentityProvider, Prisma, User, UserKind } from "@prisma/client";
import { queueEmail } from "@/server/email/outbox";
import { audit } from "@/server/org/audit";
import { providerName, type ProviderProfile } from "./oauth";
import { assertNotLocked, AuthError, clock, createSession, normaliseEmail, primaryOrganisationId, secondStepStage, type AuthDeps, type RequestContext, type SessionWithUser } from "./service";
import { assertStepUp } from "./step-up";

/**
 * Microsoft and Google accounts as the first sign-in step
 * (docs/FINAL_BUILD.md, Milestone 5). The second step, a code or a
 * passkey, is still asked for. An account found by email is never signed
 * into straight away: the person confirms with their current sign-in
 * first, and only then is the Microsoft or Google account linked.
 */

export type IdentityOutcome =
  /** A linked account: signed in as far as the second step. */
  | { kind: "session"; token: string; stage: "CODE_PENDING" | "SETUP_PENDING" }
  /** An account with this email exists: sign in the usual way once, then it links. */
  | { kind: "confirm-link"; email: string }
  /** Nobody has this email: carry on to sign-up. */
  | { kind: "sign-up"; email: string; name: string | null }
  | { kind: "refused"; reason: "no-email" | "unverified" | "deactivated" | "unknown-staff" };

export interface PendingIdentity {
  provider: IdentityProvider;
  subject: string;
  email: string;
  name: string | null;
}

export const pendingFrom = (p: ProviderProfile): PendingIdentity => ({ provider: p.provider, subject: p.subject, email: normaliseEmail(p.email ?? ""), name: p.name });

async function sessionFor(deps: AuthDeps, user: User, audience: UserKind, ctx: RequestContext): Promise<IdentityOutcome> {
  const now = clock(deps);
  assertNotLocked(user, now);
  const stage = (await secondStepStage(deps.db, user)) as "CODE_PENDING" | "SETUP_PENDING";
  const token = await deps.db.$transaction(async (tx) => createSession(tx, user, stage, audience === "CUSTOMER" ? await primaryOrganisationId(tx, user.id) : null, ctx, now));
  return { kind: "session", token, stage };
}

/**
 * The first step with a Microsoft or Google account. Staff sign in only
 * from our own Microsoft tenant, matched to their staff account by email
 * the first time, since we manage those addresses ourselves.
 */
export async function signInWithProfile(deps: AuthDeps, profile: ProviderProfile, audience: UserKind, ctx: RequestContext = {}): Promise<IdentityOutcome> {
  const now = clock(deps);
  const linked = await deps.db.externalIdentity.findUnique({ where: { provider_subject: { provider: profile.provider, subject: profile.subject } }, include: { user: true } });
  if (linked) {
    // A Microsoft or Google account linked to the other console's account opens nothing here.
    if (linked.user.kind !== audience) return { kind: "refused", reason: audience === "STAFF" ? "unknown-staff" : "deactivated" };
    if (linked.user.deactivatedAt) return { kind: "refused", reason: "deactivated" };
    await deps.db.externalIdentity.update({ where: { id: linked.id }, data: { lastUsedAt: now, ...(profile.email ? { email: normaliseEmail(profile.email) } : {}) } });
    return sessionFor(deps, linked.user, audience, ctx);
  }

  if (!profile.email) return { kind: "refused", reason: "no-email" };
  if (!profile.emailVerified) return { kind: "refused", reason: "unverified" };
  const email = normaliseEmail(profile.email);
  const user = await deps.db.user.findUnique({ where: { email } });

  if (audience === "STAFF") {
    if (!user || user.kind !== "STAFF") return { kind: "refused", reason: "unknown-staff" };
    if (user.deactivatedAt) return { kind: "refused", reason: "deactivated" };
    await deps.db.$transaction(async (tx) => {
      await tx.externalIdentity.deleteMany({ where: { userId: user.id, provider: profile.provider } });
      await tx.externalIdentity.create({ data: { userId: user.id, provider: profile.provider, subject: profile.subject, email, lastUsedAt: now } });
    });
    return sessionFor(deps, user, audience, ctx);
  }

  if (user) {
    if (user.kind !== "CUSTOMER" || user.deactivatedAt) return { kind: "refused", reason: "deactivated" };
    return { kind: "confirm-link", email };
  }
  return { kind: "sign-up", email, name: profile.name };
}

async function recordChange(tx: Prisma.TransactionClient, session: SessionWithUser, what: string, added: boolean, ctx: RequestContext, now: Date) {
  if (session.user.kind === "CUSTOMER" && session.activeOrganisationId) {
    await audit(tx, {
      organisationId: session.activeOrganisationId,
      actorKind: "CUSTOMER",
      actorUserId: session.userId,
      actorLabel: session.user.name,
      action: added ? "auth.sign_in_method_added" : "auth.sign_in_method_removed",
      summary: `${added ? "Added" : "Removed"} ${what} ${added ? "to" : "from"} their sign-in`,
      ipAddress: ctx.ipAddress,
    });
  }
  await queueEmail(tx, { to: session.user.email, kind: added ? "security.sign_in_method_added" : "security.sign_in_method_removed", payload: { at: now.toISOString(), what } });
}

/**
 * Links a Microsoft or Google account to the signed-in person. Only for the
 * same verified email, and only straight after they signed in the usual
 * way or passed a recent check.
 */
export async function linkIdentity(deps: AuthDeps, session: SessionWithUser, pending: PendingIdentity, ctx: RequestContext = {}): Promise<void> {
  const now = clock(deps);
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  assertStepUp(session, now);
  if (normaliseEmail(pending.email) !== session.user.email) throw new AuthError("invalid-input", `That ${providerName(pending.provider)} account is for a different email.`);
  await deps.db.$transaction(async (tx) => {
    const taken = await tx.externalIdentity.findUnique({ where: { provider_subject: { provider: pending.provider, subject: pending.subject } } });
    if (taken && taken.userId !== session.userId) throw new AuthError("invalid-input", `That ${providerName(pending.provider)} account is already linked to someone else.`);
    await tx.externalIdentity.deleteMany({ where: { userId: session.userId, provider: pending.provider } });
    await tx.externalIdentity.create({ data: { userId: session.userId, provider: pending.provider, subject: pending.subject, email: session.user.email, lastUsedAt: now } });
    await recordChange(tx, session, `your ${providerName(pending.provider)} account`, true, ctx, now);
  });
}

/** Unlinks a Microsoft or Google account, as long as another way in remains. */
export async function unlinkIdentity(deps: AuthDeps, session: SessionWithUser, provider: IdentityProvider, ctx: RequestContext = {}): Promise<void> {
  const now = clock(deps);
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  assertStepUp(session, now);
  const [user, others, passkeys] = await Promise.all([
    deps.db.user.findUniqueOrThrow({ where: { id: session.userId } }),
    deps.db.externalIdentity.count({ where: { userId: session.userId, provider: { not: provider } } }),
    deps.db.passkey.count({ where: { userId: session.userId } }),
  ]);
  if (!user.passwordHash && !others && !passkeys) {
    throw new AuthError("invalid-input", `This is your only way to sign in. Add a password (with "Forgot password?") or a passkey first.`);
  }
  await deps.db.$transaction(async (tx) => {
    const { count } = await tx.externalIdentity.deleteMany({ where: { userId: session.userId, provider } });
    if (count) await recordChange(tx, session, `your ${providerName(provider)} account`, false, ctx, now);
  });
}

export { recordChange as recordSignInMethodChange };
