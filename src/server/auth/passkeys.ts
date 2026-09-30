import type { Passkey, UserKind } from "@prisma/client";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { queueEmail } from "@/server/email/outbox";
import { audit } from "@/server/org/audit";
import { recordSignInMethodChange } from "./identities";
import { generateRecoveryCodes, hashRecoveryCode } from "./recovery-codes";
import { assertNotLocked, AuthError, clock, finishSignIn, primaryOrganisationId, promote, requireStage, type AuthDeps, type RequestContext, type SessionWithUser } from "./service";
import { assertStepUp } from "./step-up";

/**
 * Passkeys: the fingerprint, face or PIN that unlocks the person's device
 * (docs/FINAL_BUILD.md, Milestone 5). One is a way in on its own, since it
 * is already two factors, and the second step after a password or a
 * Microsoft or Google account. Every passkey must verify the person (not
 * just a tap), and each challenge is used once.
 */

/** The site passkeys belong to: the console's own address. */
export interface RelyingParty {
  /** The host, e.g. console.fourthgeneration.technology. */
  id: string;
  name: string;
  /** e.g. https://console.fourthgeneration.technology */
  origin: string;
}

export function relyingParty(appUrl: string, name: string): RelyingParty {
  const u = new URL(appUrl);
  return { id: u.hostname, name, origin: u.origin };
}

const MAX_PASSKEYS = 10;

/** A name for the list on the Security page, from the browser that made it. */
export function passkeyName(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const device = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "This device";
  return `Passkey on ${device}`;
}

export async function registrationOptions(deps: AuthDeps, rp: RelyingParty, user: { id: string; email: string; name: string }): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await deps.db.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  if (existing.length >= MAX_PASSKEYS) throw new AuthError("invalid-input", `You have ${MAX_PASSKEYS} passkeys. Remove one first.`);
  return generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
}

export function authenticationOptions(rp: RelyingParty, credentials: Pick<Passkey, "credentialId" | "transports">[] = []): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
  });
}

/** Options for someone already part-way in: only their own passkeys. */
export async function authenticationOptionsFor(deps: AuthDeps, rp: RelyingParty, userId: string) {
  const mine = await deps.db.passkey.findMany({ where: { userId }, select: { credentialId: true, transports: true } });
  if (!mine.length) throw new AuthError("invalid-input", "You have no passkey yet.");
  return authenticationOptions(rp, mine);
}

async function verifyRegistration(rp: RelyingParty, response: RegistrationResponseJSON, challenge: string) {
  const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true }).catch(() => null);
  if (!result?.verified) throw new AuthError("invalid-code", "The passkey couldn't be saved. Try again.");
  const { credential, credentialBackedUp } = result.registrationInfo;
  return { credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [], backedUp: credentialBackedUp };
}

/** Checks a passkey sign-in and moves its counter on. Optionally only one person's passkeys. */
export async function verifyPasskey(deps: AuthDeps, rp: RelyingParty, response: AuthenticationResponseJSON, challenge: string, userId?: string) {
  const now = clock(deps);
  const passkey = await deps.db.passkey.findUnique({ where: { credentialId: response.id }, include: { user: true } });
  if (!passkey || (userId && passkey.userId !== userId)) throw new AuthError("invalid-code", "That passkey isn't one we know. Use another way to sign in.");
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: true,
    credential: { id: passkey.credentialId, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: passkey.transports as never },
  }).catch(() => null);
  if (!result?.verified) throw new AuthError("invalid-code", "The passkey didn't work. Try again.");
  // A counter that goes backwards means a copied passkey; synced passkeys always report 0.
  const next = result.authenticationInfo.newCounter;
  if (passkey.counter > 0 && next <= passkey.counter) throw new AuthError("invalid-code", "The passkey didn't work. Try again.");
  const moved = await deps.db.passkey.updateMany({
    where: { id: passkey.id, counter: passkey.counter },
    data: { counter: next, lastUsedAt: now, backedUp: result.authenticationInfo.credentialBackedUp },
  });
  if (moved.count !== 1) throw new AuthError("invalid-code", "The passkey didn't work. Try again.");
  return passkey;
}

/** Signs in with a passkey alone: it is both steps. */
export async function signInWithPasskey(
  deps: AuthDeps,
  rp: RelyingParty,
  response: AuthenticationResponseJSON,
  challenge: string,
  audience: UserKind,
  ctx: RequestContext = {},
): Promise<{ token: string }> {
  const now = clock(deps);
  const { user } = await verifyPasskey(deps, rp, response, challenge);
  if (user.kind !== audience || user.deactivatedAt) throw new AuthError("invalid-code", "That passkey isn't one we know. Use another way to sign in.");
  assertNotLocked(user, now);
  const token = await deps.db.$transaction(async (tx) => finishSignIn(tx, user, audience === "CUSTOMER" ? await primaryOrganisationId(tx, user.id) : null, "passkey", ctx, now));
  return { token };
}

/** The second step with a passkey, after a password or a Microsoft or Google account. */
export async function completeSignInWithPasskey(
  deps: AuthDeps,
  rp: RelyingParty,
  token: string,
  response: AuthenticationResponseJSON,
  challenge: string,
  ctx: RequestContext = {},
): Promise<{ token: string }> {
  const now = clock(deps);
  const session = await requireStage(deps, token, ["CODE_PENDING"]);
  assertNotLocked(session.user, now);
  await verifyPasskey(deps, rp, response, challenge, session.userId);
  return { token: await deps.db.$transaction((tx) => promote(tx, session, "passkey", ctx, now)) };
}

/** The recent check with a passkey. */
export async function stepUpWithPasskey(deps: AuthDeps, rp: RelyingParty, session: SessionWithUser, response: AuthenticationResponseJSON, challenge: string): Promise<void> {
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  await verifyPasskey(deps, rp, response, challenge, session.userId);
  await deps.db.session.update({ where: { id: session.id }, data: { stepUpAt: clock(deps) } });
}

/**
 * Setting up the second step with a passkey instead of an authenticator
 * app, straight after sign-up. Returns the signed-in session and backup codes.
 */
export async function setupWithPasskey(
  deps: AuthDeps,
  rp: RelyingParty,
  token: string,
  response: RegistrationResponseJSON,
  challenge: string,
  ctx: RequestContext = {},
): Promise<{ token: string; recoveryCodes: string[] }> {
  const now = clock(deps);
  const session = await requireStage(deps, token, ["SETUP_PENDING"]);
  const saved = await verifyRegistration(rp, response, challenge);
  const recoveryCodes = generateRecoveryCodes();
  const newToken = await deps.db.$transaction(async (tx) => {
    await tx.passkey.create({ data: { userId: session.userId, ...saved, name: passkeyName(ctx.userAgent), lastUsedAt: now } });
    await tx.recoveryCode.deleteMany({ where: { userId: session.userId } });
    await tx.recoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId: session.userId, codeHash: hashRecoveryCode(c) })) });
    if (session.activeOrganisationId) {
      await audit(tx, {
        organisationId: session.activeOrganisationId,
        actorKind: "CUSTOMER",
        actorUserId: session.userId,
        actorLabel: session.user.name,
        action: "auth.two_step_on",
        summary: "Turned on two-step login with a passkey",
        ipAddress: ctx.ipAddress,
      });
    }
    await queueEmail(tx, { to: session.user.email, kind: "security.sign_in_method_added", payload: { at: now.toISOString(), what: "A passkey" } });
    return promote(tx, session, "passkey", ctx, now);
  });
  return { token: newToken, recoveryCodes };
}

/** Adds a passkey for someone signed in, after a recent check. */
export async function addPasskey(deps: AuthDeps, rp: RelyingParty, session: SessionWithUser, response: RegistrationResponseJSON, challenge: string, ctx: RequestContext = {}): Promise<Passkey> {
  const now = clock(deps);
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  assertStepUp(session, now);
  const saved = await verifyRegistration(rp, response, challenge);
  return deps.db.$transaction(async (tx) => {
    if ((await tx.passkey.count({ where: { userId: session.userId } })) >= MAX_PASSKEYS) throw new AuthError("invalid-input", `You have ${MAX_PASSKEYS} passkeys. Remove one first.`);
    const passkey = await tx.passkey.create({ data: { userId: session.userId, ...saved, name: passkeyName(ctx.userAgent) } });
    await recordSignInMethodChange(tx, session, `a passkey (${passkey.name})`, true, ctx, now);
    return passkey;
  });
}

/** Removes a passkey, as long as a code or another passkey is left for the second step. */
export async function removePasskey(deps: AuthDeps, session: SessionWithUser, passkeyId: string, ctx: RequestContext = {}): Promise<void> {
  const now = clock(deps);
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  assertStepUp(session, now);
  const passkey = await deps.db.passkey.findFirst({ where: { id: passkeyId, userId: session.userId } });
  if (!passkey) return;
  const [user, others] = await Promise.all([deps.db.user.findUniqueOrThrow({ where: { id: session.userId } }), deps.db.passkey.count({ where: { userId: session.userId, id: { not: passkeyId } } })]);
  if (!user.totpEnabled && !others) throw new AuthError("invalid-input", "This passkey is your second step. Set up an authenticator app or add another passkey first.");
  await deps.db.$transaction(async (tx) => {
    await tx.passkey.delete({ where: { id: passkey.id } });
    await recordSignInMethodChange(tx, session, `a passkey (${passkey.name})`, false, ctx, now);
  });
}

export async function renamePasskey(deps: AuthDeps, session: SessionWithUser, passkeyId: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) throw new AuthError("invalid-input", "Give the passkey a name.");
  await deps.db.passkey.updateMany({ where: { id: passkeyId, userId: session.userId }, data: { name: clean } });
}
