import type { Session } from "@prisma/client";
import { open } from "./secret-box";
import { assertNotLocked, AuthError, clock, recordFailure, type AuthDeps, type RequestContext, type SessionWithUser } from "./service";
import { verifyTotp } from "./totp";

/**
 * The recent check before sensitive actions (docs/FINAL_BUILD.md,
 * Milestone 5): paying, managing people and their roles, cancelling or
 * reducing services, and changing sign-in and security settings need a
 * passkey or authenticator code in the last 15 minutes, whichever way the
 * person signed in. Signing in with a code or passkey counts.
 */

export const STEP_UP_MS = 15 * 60 * 1000;

export const stepUpFresh = (session: Pick<Session, "stepUpAt">, now = new Date()) => Boolean(session.stepUpAt && now.getTime() - session.stepUpAt.getTime() < STEP_UP_MS);

export function assertStepUp(session: Pick<Session, "stepUpAt">, now = new Date()) {
  if (!stepUpFresh(session, now)) throw new AuthError("step-up", "Confirm it's you first.");
}

/** Records a passed check on this session. */
export async function markStepUp(deps: AuthDeps, sessionId: string) {
  await deps.db.session.update({ where: { id: sessionId }, data: { stepUpAt: clock(deps) } });
}

/** The check with a code from the authenticator app. Wrong codes count towards the lock, as at sign-in. */
export async function stepUpWithCode(deps: AuthDeps, session: SessionWithUser, code: string, ctx: RequestContext = {}): Promise<void> {
  const now = clock(deps);
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  const user = await deps.db.user.findUniqueOrThrow({ where: { id: session.userId } });
  assertNotLocked(user, now);
  if (!user.totpSecret || !user.totpEnabled) throw new AuthError("invalid-code", "Use your passkey instead.");
  const step = verifyTotp(open(user.totpSecret, deps.encryptionKey), code, { at: now, lastUsedStep: user.totpLastStep });
  if (step === null) return recordFailure(deps, user, "WRONG_CODE", ctx, now);
  const claimed = await deps.db.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step, failedAttempts: 0 } });
  if (claimed.count !== 1) throw new AuthError("invalid-code", "That code has already been used. Wait for the next one.");
  await deps.db.session.update({ where: { id: session.id }, data: { stepUpAt: now } });
}
