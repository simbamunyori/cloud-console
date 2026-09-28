/** The whole sign-up and sign-in journey against a real database. */
import { afterAll, describe, expect, it } from "vitest";
import {
  AuthError,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  PENDING_TTL_MS,
  beginAuthenticatorSetup,
  completeSignIn,
  confirmAuthenticatorSetup,
  getSession,
  regenerateRecoveryCodes,
  signOut,
  signUp,
  startSignIn,
} from "../src/server/auth/service";
import { totpAt } from "../src/server/auth/totp";
import { PASSWORD, db, hasDb, testDeps, uniqueEmail } from "./helpers";

describe.skipIf(!hasDb)("sign-up and sign-in", () => {
  let now = new Date("2026-09-27T08:00:00Z");
  const deps = testDeps(() => now);
  const email = uniqueEmail("simba");
  const password = PASSWORD;
  let secret = "";
  let recoveryCodes: string[] = [];
  let organisationId = "";
  const advance = (ms: number) => (now = new Date(now.getTime() + ms));
  const ua = { userAgent: "Mozilla/5.0 (iPhone) Safari/604.1", ipAddress: "196.45.1.2" };

  afterAll(async () => {
    await db.$disconnect();
  });

  async function expectAuthError(p: Promise<unknown>, code: AuthError["code"]) {
    await expect(p).rejects.toMatchObject({ name: "AuthError", code });
  }

  it("creates an organisation with its owner, and requires an authenticator before anything else", async () => {
    const result = await signUp(deps, { organisationName: "Gaborone Dental Group", name: "Simba Marima", email, password }, ua);
    organisationId = result.organisationId;
    const session = await getSession(deps, result.token);
    expect(session?.stage).toBe("SETUP_PENDING");
    const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, include: { memberships: true } });
    expect(org).toMatchObject({ currency: "BWP", country: "BW" });
    expect(org.memberships[0]).toMatchObject({ role: "OWNER" });

    const setup = await beginAuthenticatorSetup(deps, result.token);
    expect((await beginAuthenticatorSetup(deps, result.token)).secret).toBe(setup.secret);
    secret = setup.secret;
    const stored = await db.user.findUniqueOrThrow({ where: { email } });
    expect(stored.totpSecret).not.toContain(secret);
    expect(stored.passwordHash).not.toContain(password);

    await expectAuthError(confirmAuthenticatorSetup(deps, result.token, "000000", ua), "invalid-code");
    const done = await confirmAuthenticatorSetup(deps, result.token, totpAt(secret, now), ua);
    recoveryCodes = done.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect((await getSession(deps, done.token))?.stage).toBe("ACTIVE");
    expect(await getSession(deps, result.token)).toBeNull();
  });

  it("keeps customer and staff sessions apart", async () => {
    advance(60_000);
    const a = await startSignIn(deps, { email, password }, ua, "CUSTOMER");
    const { token } = await completeSignIn(deps, a.token, totpAt(secret, now), ua);
    expect(await getSession(deps, token, "CUSTOMER")).not.toBeNull();
    expect(await getSession(deps, token, "STAFF")).toBeNull();
    // A customer can't sign in to the staff console, and gets the same answer as a wrong password.
    await expectAuthError(startSignIn(deps, { email, password }, ua, "STAFF"), "invalid-credentials");
  });

  it("refuses a second account with the same email, and weak passwords", async () => {
    await expectAuthError(signUp(deps, { organisationName: "Other", name: "X", email: email.toUpperCase(), password }), "email-taken");
    await expectAuthError(signUp(deps, { organisationName: "Other", name: "X", email: `x${email}`, password: "short" }), "weak-password");
  });

  it("refuses a replayed code", async () => {
    advance(60_000);
    const first = await startSignIn(deps, { email, password }, ua);
    expect(first.stage).toBe("CODE_PENDING");
    const code = totpAt(secret, now);
    await completeSignIn(deps, first.token, code, ua);
    const second = await startSignIn(deps, { email, password }, ua);
    await expectAuthError(completeSignIn(deps, second.token, code, ua), "invalid-code");
  });

  it("gives the same answer for a wrong email and a wrong password", async () => {
    await expectAuthError(startSignIn(deps, { email: "nobody@example.com", password }), "invalid-credentials");
    await expectAuthError(startSignIn(deps, { email, password: "wrong-password-123" }), "invalid-credentials");
  });

  it("accepts each backup code once, and emails about it", async () => {
    advance(60_000);
    const a = await startSignIn(deps, { email, password }, ua);
    const r = await completeSignIn(deps, a.token, recoveryCodes[0].toLowerCase(), ua);
    expect(r).toMatchObject({ usedRecoveryCode: true, recoveryCodesLeft: 9 });
    const b = await startSignIn(deps, { email, password }, ua);
    await expectAuthError(completeSignIn(deps, b.token, recoveryCodes[0], ua), "invalid-code");
    expect(await db.outboundEmail.count({ where: { toAddress: email, kind: "security.recovery_code_used" } })).toBe(1);
  });

  it("the code step expires", async () => {
    advance(60_000);
    const a = await startSignIn(deps, { email, password });
    advance(PENDING_TTL_MS + 1);
    await expectAuthError(completeSignIn(deps, a.token, totpAt(secret, now)), "no-session");
  });

  it("emails when a new device signs in", async () => {
    advance(60_000);
    const a = await startSignIn(deps, { email, password }, { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ipAddress: "41.1.1.1" });
    await completeSignIn(deps, a.token, totpAt(secret, now), { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ipAddress: "41.1.1.1" });
    expect(await db.outboundEmail.count({ where: { toAddress: email, kind: "security.new_sign_in" } })).toBe(1);
  });

  it("makes new backup codes only with a current code", async () => {
    advance(60_000);
    const a = await startSignIn(deps, { email, password }, ua);
    const { token } = await completeSignIn(deps, a.token, totpAt(secret, now), ua);
    const session = (await getSession(deps, token))!;
    advance(30_000);
    await expectAuthError(regenerateRecoveryCodes(deps, session, "000000"), "invalid-code");
    const codes = await regenerateRecoveryCodes(deps, session, totpAt(secret, now));
    expect(codes).toHaveLength(10);
    expect(await db.recoveryCode.count({ where: { user: { email }, usedAt: null } })).toBe(10);
  });

  it("signs out", async () => {
    advance(60_000);
    const a = await startSignIn(deps, { email, password });
    const { token } = await completeSignIn(deps, a.token, totpAt(secret, now));
    await signOut(deps, token);
    expect(await getSession(deps, token)).toBeNull();
  });

  it("locks the account after repeated failures, then recovers", async () => {
    advance(60_000);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      await expectAuthError(startSignIn(deps, { email, password: "wrong-password-123" }), "invalid-credentials");
    }
    await expectAuthError(startSignIn(deps, { email, password: "wrong-password-123" }), "locked");
    await expectAuthError(startSignIn(deps, { email, password }), "locked");
    advance(LOCKOUT_MS + 1);
    expect((await startSignIn(deps, { email, password })).stage).toBe("CODE_PENDING");
  });

  it("keeps a sign-in history the customer can see", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const outcomes = (await db.signInEvent.findMany({ where: { userId: user.id } })).map((e) => e.outcome);
    expect(outcomes).toEqual(expect.arrayContaining(["SUCCEEDED", "WRONG_PASSWORD", "WRONG_CODE", "LOCKED"]));
    const actions = (await db.auditEvent.findMany({ where: { organisationId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["organisation.created", "auth.two_step_on", "auth.backup_codes_replaced"]));
  });
});
