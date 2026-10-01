/** Sign in with Microsoft and Google, passkeys, and the recent check (docs/FINAL_BUILD.md, Milestone 5). */
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkIdentity, signInWithProfile, unlinkIdentity } from "../src/server/auth/identities";
import { authorizeUrl, MICROSOFT_CONSUMERS_TENANT, newFlowSecrets, verifyIdToken, type ProviderProfile, type ProviderSettings } from "../src/server/auth/oauth";
import { passkeyName, relyingParty, removePasskey } from "../src/server/auth/passkeys";
import {
  beginAuthenticatorSetup,
  completeSignIn,
  confirmAuthenticatorSetup,
  getSession,
  replaceRecoveryCodes,
  signUp,
  startSignIn,
  type AuthError,
  type SessionWithUser,
} from "../src/server/auth/service";
import { STEP_UP_MS, stepUpFresh, stepUpWithCode } from "../src/server/auth/step-up";
import { totpAt } from "../src/server/auth/totp";
import { PASSWORD, db, hasDb, testDeps, uniqueEmail } from "./helpers";

const GOOGLE: ProviderSettings = { provider: "GOOGLE", clientId: "google-client", clientSecret: "x" };
const MICROSOFT: ProviderSettings = { provider: "MICROSOFT", clientId: "ms-client", clientSecret: "x" };
const STAFF_TENANT = "11111111-2222-3333-4444-555555555555";
const WORK_TENANT = "99999999-8888-7777-6666-555555555555";

describe("Microsoft and Google ID tokens", () => {
  let keys: JWTVerifyGetKey;
  let sign: (claims: Record<string, unknown>, o?: { aud?: string; iss?: string; exp?: string }) => Promise<string>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
    sign = (claims, o = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuedAt()
        .setExpirationTime(o.exp ?? "5m")
        .setAudience(o.aud ?? "google-client")
        .setIssuer(o.iss ?? "https://accounts.google.com")
        .sign(privateKey);
  });

  it("asks for the account every time, with PKCE and a nonce, and only for identity", () => {
    const f = newFlowSecrets();
    const google = new URL(authorizeUrl(GOOGLE, f, "https://console.example/auth/google/callback"));
    expect(google.origin).toBe("https://accounts.google.com");
    expect(Object.fromEntries(google.searchParams)).toMatchObject({ state: f.state, nonce: f.nonce, code_challenge_method: "S256", prompt: "select_account", scope: "openid email profile" });
    expect(google.searchParams.get("code_challenge")).not.toBe(f.verifier);
    expect(new URL(authorizeUrl(MICROSOFT, f, "x")).pathname).toBe("/common/oauth2/v2.0/authorize");
    expect(new URL(authorizeUrl({ ...MICROSOFT, tenantId: STAFF_TENANT }, f, "x")).pathname).toBe(`/${STAFF_TENANT}/oauth2/v2.0/authorize`);
  });

  it("reads a Google account and whether Google vouches for its email", async () => {
    const token = await sign({ sub: "g-123", email: "Neo@Example.com", email_verified: true, name: "Neo K", nonce: "n1" });
    expect(await verifyIdToken(GOOGLE, token, "n1", keys)).toEqual({ provider: "GOOGLE", subject: "g-123", email: "neo@example.com", emailVerified: true, name: "Neo K" });
    const unverified = await sign({ sub: "g-124", email: "x@example.com", email_verified: false, nonce: "n1" });
    expect((await verifyIdToken(GOOGLE, unverified, "n1", keys)).emailVerified).toBe(false);
  });

  it("refuses a token with the wrong nonce, audience, issuer or expiry", async () => {
    const good = { sub: "g-1", email: "a@example.com", email_verified: true, nonce: "n1" };
    await expect(verifyIdToken(GOOGLE, await sign(good), "other", keys)).rejects.toThrow();
    await expect(verifyIdToken(GOOGLE, await sign(good, { aud: "someone-else" }), "n1", keys)).rejects.toThrow();
    await expect(verifyIdToken(GOOGLE, await sign(good, { iss: "https://evil.example" }), "n1", keys)).rejects.toThrow();
    await expect(verifyIdToken(GOOGLE, await sign(good, { exp: "-10m" }), "n1", keys)).rejects.toThrow();
  });

  it("names Microsoft accounts by tenant and object id, and trusts emails only where Microsoft vouches for them", async () => {
    const ms = (tid: string, extra: Record<string, unknown> = {}) =>
      sign({ tid, oid: "o-1", email: "neo@kgalehill.co.bw", name: "Neo", nonce: "n", ...extra }, { aud: "ms-client", iss: `https://login.microsoftonline.com/${tid}/v2.0` });
    const personal = await verifyIdToken(MICROSOFT, await ms(MICROSOFT_CONSUMERS_TENANT), "n", keys);
    expect(personal).toMatchObject({ subject: `${MICROSOFT_CONSUMERS_TENANT}:o-1`, emailVerified: true });
    // A work account's email is only its admin's say-so, unless Microsoft checked the domain.
    expect((await verifyIdToken(MICROSOFT, await ms(WORK_TENANT), "n", keys)).emailVerified).toBe(false);
    expect((await verifyIdToken(MICROSOFT, await ms(WORK_TENANT, { xms_edov: true }), "n", keys)).emailVerified).toBe(true);
    // The issuer must be the token's own tenant.
    const forged = await sign({ tid: WORK_TENANT, oid: "o", nonce: "n" }, { aud: "ms-client", iss: `https://login.microsoftonline.com/${STAFF_TENANT}/v2.0` });
    await expect(verifyIdToken(MICROSOFT, forged, "n", keys)).rejects.toThrow("unexpected issuer");
    // Staff only from our tenant.
    await expect(verifyIdToken({ ...MICROSOFT, tenantId: STAFF_TENANT }, await ms(WORK_TENANT), "n", keys)).rejects.toThrow("Staff sign in");
    expect((await verifyIdToken({ ...MICROSOFT, tenantId: STAFF_TENANT }, await ms(STAFF_TENANT), "n", keys)).emailVerified).toBe(true);
  });
});

describe("passkey basics", () => {
  it("belong to the console's own address", () => {
    expect(relyingParty("https://console.fourthgeneration.technology/", "Cloud Console")).toEqual({
      id: "console.fourthgeneration.technology",
      name: "Cloud Console",
      origin: "https://console.fourthgeneration.technology",
    });
  });

  it("get a name from the device that made them", () => {
    expect(passkeyName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("Passkey on iPhone or iPad");
    expect(passkeyName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Passkey on Windows");
    expect(passkeyName(null)).toBe("Passkey on This device");
  });

  it("count as a recent check for 15 minutes", () => {
    const at = new Date("2026-10-01T08:00:00Z");
    expect(stepUpFresh({ stepUpAt: at }, new Date(at.getTime() + STEP_UP_MS - 1))).toBe(true);
    expect(stepUpFresh({ stepUpAt: at }, new Date(at.getTime() + STEP_UP_MS))).toBe(false);
    expect(stepUpFresh({ stepUpAt: null }, at)).toBe(false);
  });
});

describe.skipIf(!hasDb)("Microsoft and Google accounts against the database", () => {
  let now = new Date("2026-10-01T08:00:00Z");
  const deps = testDeps(() => now);
  const advance = (ms: number) => (now = new Date(now.getTime() + ms));
  const profile = (over: Partial<ProviderProfile> = {}): ProviderProfile => ({
    provider: "GOOGLE",
    subject: `g-${Math.random()}`,
    email: uniqueEmail("google"),
    emailVerified: true,
    name: "Lesedi M",
    ...over,
  });
  const code = (e: unknown) => (e as AuthError).code;

  afterAll(() => db.$disconnect());

  /** A customer with a password and authenticator, fully signed in. */
  async function customer() {
    const email = uniqueEmail("linker");
    const { token } = await signUp(deps, { organisationName: "Linker Ltd", name: "Kabo", email, password: PASSWORD });
    const { secret } = await beginAuthenticatorSetup(deps, token);
    const done = await confirmAuthenticatorSetup(deps, token, totpAt(secret, now));
    return { email, secret, token: done.token, session: (await getSession(deps, done.token))! };
  }

  it("sends a new person to sign-up, and signs them up with no password", async () => {
    const p = profile();
    expect(await signInWithProfile(deps, p, "CUSTOMER")).toEqual({ kind: "sign-up", email: p.email, name: "Lesedi M" });
    const { token } = await signUp(deps, { organisationName: "Lesedi Designs", name: "Lesedi M", email: p.email!, identity: { provider: "GOOGLE", subject: p.subject, email: p.email! } });
    expect((await getSession(deps, token))?.stage).toBe("SETUP_PENDING");
    const user = await db.user.findUniqueOrThrow({ where: { email: p.email! } });
    expect(user.passwordHash).toBe("");
    expect(user.emailVerifiedAt).not.toBeNull();
    // No password means no password sign-in, whatever is typed.
    await expect(startSignIn(deps, { email: p.email!, password: "" })).rejects.toMatchObject({ code: "invalid-credentials" });
    // Google now signs them in, as far as the second step.
    const again = await signInWithProfile(deps, p, "CUSTOMER");
    expect(again).toMatchObject({ kind: "session", stage: "SETUP_PENDING" });
  });

  it("never signs straight into an existing account found by email", async () => {
    const { email } = await customer();
    expect(await signInWithProfile(deps, profile({ email }), "CUSTOMER")).toEqual({ kind: "confirm-link", email });
    expect(await signInWithProfile(deps, profile({ email, emailVerified: false }), "CUSTOMER")).toEqual({ kind: "refused", reason: "unverified" });
    expect(await signInWithProfile(deps, profile({ email: null }), "CUSTOMER")).toEqual({ kind: "refused", reason: "no-email" });
    // A customer's account opens nothing on the staff side.
    expect(await signInWithProfile(deps, profile({ email }), "STAFF")).toEqual({ kind: "refused", reason: "unknown-staff" });
  });

  it("links after a recent check, for the same email only, and still asks for the second step", async () => {
    const { email, secret, session } = await customer();
    const p = profile({ provider: "MICROSOFT", email });
    await expect(linkIdentity(deps, session, { ...p, email: uniqueEmail("other"), name: null })).rejects.toMatchObject({ code: "invalid-input" });
    advance(STEP_UP_MS + 1000);
    await expect(linkIdentity(deps, session, { ...p, email: p.email!, name: null })).rejects.toMatchObject({ code: "step-up" });
    await stepUpWithCode(deps, session, totpAt(secret, now));
    const fresh = (await db.session.findUniqueOrThrow({ where: { id: session.id }, include: { user: true } })) as SessionWithUser;
    await linkIdentity(deps, fresh, { ...p, email: p.email!, name: null });
    const out = await signInWithProfile(deps, p, "CUSTOMER");
    expect(out).toMatchObject({ kind: "session", stage: "CODE_PENDING" });
    // The second step still applies.
    const signedIn = await completeSignIn(deps, (out as { token: string }).token, totpAt(secret, new Date(now.getTime() + 30_000)));
    expect((await getSession(deps, signedIn.token))?.stage).toBe("ACTIVE");
    expect(await db.outboundEmail.count({ where: { toAddress: email, kind: "security.sign_in_method_added" } })).toBe(1);

    // Someone else can't take the same Microsoft account.
    const other = await customer();
    await expect(linkIdentity(deps, other.session, { ...p, email: other.email, name: null })).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("won't unlink the only way in", async () => {
    const p = profile();
    const { token } = await signUp(deps, { organisationName: "Only Google", name: "Tumi", email: p.email!, identity: { provider: "GOOGLE", subject: p.subject, email: p.email! } });
    const { secret } = await beginAuthenticatorSetup(deps, token);
    const done = await confirmAuthenticatorSetup(deps, token, totpAt(secret, now));
    const session = (await getSession(deps, done.token))!;
    await expect(unlinkIdentity(deps, session, "GOOGLE")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(removePasskey(deps, session, "none")).resolves.toBeUndefined();
  });

  it("links staff by email from our own tenant, and refuses anyone else", async () => {
    const email = uniqueEmail("staff");
    await db.user.create({ data: { kind: "STAFF", email, name: "Staff Member", passwordHash: "x", totpEnabled: true, staffRole: "SUPPORT" } });
    const p = profile({ provider: "MICROSOFT", email, subject: `${STAFF_TENANT}:o-${Math.random()}` });
    expect(await signInWithProfile(deps, p, "STAFF")).toMatchObject({ kind: "session", stage: "CODE_PENDING" });
    expect(await signInWithProfile(deps, p, "CUSTOMER")).toEqual({ kind: "refused", reason: "deactivated" });
    expect(await signInWithProfile(deps, profile({ provider: "MICROSOFT" }), "STAFF")).toEqual({ kind: "refused", reason: "unknown-staff" });
  });

  it("checks a code once for the recent check, and new backup codes need it", async () => {
    const { secret, session } = await customer();
    // Signing in counts as the check.
    expect(stepUpFresh(session, now)).toBe(true);
    advance(STEP_UP_MS);
    await expect(replaceRecoveryCodes(deps, (await db.session.findUniqueOrThrow({ where: { id: session.id }, include: { user: true } })) as SessionWithUser)).rejects.toMatchObject({
      code: "step-up",
    });
    const c = totpAt(secret, now);
    await stepUpWithCode(deps, session, c);
    await expect(stepUpWithCode(deps, session, c)).rejects.toSatisfy((e) => ["invalid-code"].includes(code(e)));
    const fresh = (await db.session.findUniqueOrThrow({ where: { id: session.id }, include: { user: true } })) as SessionWithUser;
    expect(stepUpFresh(fresh, now)).toBe(true);
    expect(await replaceRecoveryCodes(deps, fresh)).toHaveLength(10);
  });
});
