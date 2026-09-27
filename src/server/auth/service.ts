import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient, Role, Session, SessionStage, SignInOutcome, User, UserKind } from "@prisma/client";
import { defaultMarket, marketForCountry } from "@/lib/domain/markets";
import { audit } from "@/server/org/audit";
import { queueEmail } from "@/server/email/outbox";
import { burnPasswordCheck, hashPassword, passwordStrength, verifyPassword } from "./password";
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from "./recovery-codes";
import { open, seal } from "./secret-box";
import { hashToken, newToken } from "./tokens";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

/**
 * Sign-up, sign-in and sessions for customers and staff. Every account
 * uses a password plus an authenticator app; there is no way to reach
 * ACTIVE without both.
 *
 * Adapted from Thebe (docs/shared-with-thebe.md). Functions take the
 * database client and key so they can be tested without Next.js.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
/** Time allowed between the password step and the code step. */
export const PENDING_TTL_MS = 10 * 60 * 1000;
/** Signed out after this long without activity. */
export const IDLE_TTL_MS = 12 * 60 * 60 * 1000;
/** Staff are signed out sooner. */
export const STAFF_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** Signed out after this long regardless of activity. */
export const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A device is "new" if it hasn't signed in successfully within this time. */
export const KNOWN_DEVICE_MS = 90 * 24 * 60 * 60 * 1000;
/** Avoid a database write on every request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
/** Invitation links stop working after seven days. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** "Forgot password?" links stop working after 30 minutes. */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export interface AuthDeps {
  db: PrismaClient;
  /** Base64 32-byte key for sealing TOTP secrets. */
  encryptionKey: string;
  /** Shown in the authenticator app, e.g. "Cloud Console". */
  issuer: string;
  now?: () => Date;
}

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuthError extends Error {
  constructor(
    public readonly code:
      | "invalid-credentials"
      | "locked"
      | "invalid-code"
      | "email-taken"
      | "weak-password"
      | "invalid-input"
      | "no-market"
      | "no-session",
    message: string,
    public readonly lockedUntil?: Date,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type SessionWithUser = Session & { user: User };

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clock(deps: AuthDeps): Date {
  return deps.now ? deps.now() : new Date();
}

function idleTtl(audience: UserKind) {
  return audience === "STAFF" ? STAFF_IDLE_TTL_MS : IDLE_TTL_MS;
}

function expiryFor(stage: SessionStage, audience: UserKind, now: Date): Date {
  return new Date(now.getTime() + (stage === "ACTIVE" ? idleTtl(audience) : PENDING_TTL_MS));
}

async function createSession(
  tx: Prisma.TransactionClient,
  user: Pick<User, "id" | "kind">,
  stage: SessionStage,
  organisationId: string | null,
  ctx: RequestContext,
  now: Date,
): Promise<string> {
  const token = newToken();
  await tx.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      audience: user.kind,
      stage,
      activeOrganisationId: organisationId,
      expiresAt: expiryFor(stage, user.kind, now),
      lastSeenAt: now,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent?.slice(0, 400) ?? null,
    },
  });
  return token;
}

async function primaryOrganisationId(tx: Prisma.TransactionClient, userId: string): Promise<string | null> {
  const m = await tx.membership.findFirst({
    where: { userId, active: true, organisation: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { organisationId: true },
  });
  return m?.organisationId ?? null;
}

async function recordSignIn(
  tx: Prisma.TransactionClient,
  userId: string,
  outcome: SignInOutcome,
  method: string | null,
  ctx: RequestContext,
  now: Date,
) {
  await tx.signInEvent.create({
    data: {
      userId,
      outcome,
      method,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent?.slice(0, 400) ?? null,
      createdAt: now,
    },
  });
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "organisation"
  );
}

// ─── Sign-up ─────────────────────────────────────────────────────────

export interface SignUpInput {
  organisationName: string;
  name: string;
  email: string;
  password: string;
  /** ISO 3166-1 alpha-2 billing country. Decides the market; the default market when left out. */
  country?: string;
}

/**
 * Creates the organisation and its owner, and returns a session that can
 * only set up the authenticator. The billing account is made afterwards
 * (outside this transaction, because it calls the billing engine).
 */
export async function signUp(
  deps: AuthDeps,
  input: SignUpInput,
  ctx: RequestContext = {},
): Promise<{ token: string; organisationId: string; userId: string }> {
  const email = normaliseEmail(input.email);
  const name = input.name.trim().replace(/\s+/g, " ");
  const organisationName = input.organisationName.trim().replace(/\s+/g, " ");
  if (!organisationName || !name || !EMAIL_PATTERN.test(email) || organisationName.length > 120 || name.length > 80) {
    throw new AuthError("invalid-input", "Fill in every field.");
  }
  if (passwordStrength(input.password, [email, name, organisationName]) !== "strong") {
    throw new AuthError("weak-password", "Choose a password of at least 12 characters that isn't easy to guess.");
  }
  const markets = await deps.db.market.findMany();
  const market = input.country ? marketForCountry(input.country, markets) : defaultMarket(markets);
  if (!market) throw new AuthError("no-market", "We don't serve that country yet.");
  const country = (input.country ?? market.countries[0] ?? "BW").toUpperCase();
  const passwordHash = await hashPassword(input.password);
  const now = clock(deps);

  return deps.db.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new AuthError("email-taken", "An account with this email already exists.");
    }
    const user = await tx.user.create({ data: { email, name, passwordHash, kind: "CUSTOMER" } });
    const base = slugify(organisationName);
    const slug = (await tx.organisation.findUnique({ where: { slug: base }, select: { id: true } }))
      ? `${base}-${randomBytes(3).toString("hex")}`
      : base;
    const org = await tx.organisation.create({
      data: {
        name: organisationName,
        slug,
        country,
        billingMarket: market.code,
        currency: market.currency,
        timeZone: market.timeZone,
        locale: market.locale,
        billingEmail: email,
      },
    });
    await tx.membership.create({ data: { organisationId: org.id, userId: user.id, role: "OWNER" } });
    await audit(tx, {
      organisationId: org.id,
      actorKind: "CUSTOMER",
      actorUserId: user.id,
      actorLabel: name,
      action: "organisation.created",
      summary: `Created the account for ${organisationName}`,
      targetType: "Organisation",
      targetId: org.id,
      ipAddress: ctx.ipAddress,
    });
    const token = await createSession(tx, user, "SETUP_PENDING", org.id, ctx, now);
    return { token, organisationId: org.id, userId: user.id };
  });
}

// ─── Sign-in, step 1: password ───────────────────────────────────────

async function recordFailure(deps: AuthDeps, user: User, outcome: SignInOutcome, ctx: RequestContext, now: Date): Promise<never> {
  const attempts = user.failedAttempts + 1;
  const lock = attempts >= MAX_FAILED_ATTEMPTS;
  const lockedUntil = lock ? new Date(now.getTime() + LOCKOUT_MS) : null;
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedAttempts: lock ? 0 : attempts, lockedUntil: lock ? lockedUntil : user.lockedUntil },
    });
    await recordSignIn(tx, user.id, lock ? "LOCKED" : outcome, null, ctx, now);
    if (lock) {
      await tx.session.updateMany({
        where: { userId: user.id, stage: { not: "ACTIVE" }, revokedAt: null },
        data: { revokedAt: now },
      });
      await queueEmail(tx, { to: user.email, kind: "security.locked", payload: { until: lockedUntil!.toISOString() } });
    }
  });
  if (lock) throw new AuthError("locked", "Too many attempts.", lockedUntil!);
  throw new AuthError(outcome === "WRONG_CODE" ? "invalid-code" : "invalid-credentials", "That didn't match.");
}

function assertNotLocked(user: User, now: Date) {
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    throw new AuthError("locked", "Too many attempts.", user.lockedUntil);
  }
}

/**
 * Checks email and password for the given audience (customer console or
 * staff console). Returns a session waiting for the authenticator code,
 * or for authenticator setup if there is none yet. A wrong email, a wrong
 * password and an account of the other kind all look the same.
 */
export async function startSignIn(
  deps: AuthDeps,
  input: { email: string; password: string },
  ctx: RequestContext = {},
  audience: UserKind = "CUSTOMER",
): Promise<{ token: string; stage: SessionStage }> {
  const now = clock(deps);
  const user = await deps.db.user.findUnique({ where: { email: normaliseEmail(input.email) } });
  if (!user || user.kind !== audience || user.deactivatedAt) {
    await burnPasswordCheck(input.password);
    throw new AuthError("invalid-credentials", "Email or password is incorrect.");
  }
  assertNotLocked(user, now);
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    return recordFailure(deps, user, "WRONG_PASSWORD", ctx, now);
  }
  const stage: SessionStage = user.totpEnabled ? "CODE_PENDING" : "SETUP_PENDING";
  const token = await deps.db.$transaction(async (tx) =>
    createSession(tx, user, stage, audience === "CUSTOMER" ? await primaryOrganisationId(tx, user.id) : null, ctx, now),
  );
  return { token, stage };
}

// ─── Sessions ────────────────────────────────────────────────────────

/** The session for a cookie value, or null if unknown, revoked, expired or for the other console. */
export async function getSession(
  deps: AuthDeps,
  token: string | undefined | null,
  audience: UserKind = "CUSTOMER",
): Promise<SessionWithUser | null> {
  if (!token) return null;
  const now = clock(deps);
  const session = await deps.db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.audience !== audience) return null;
  if (session.user.kind !== audience || session.user.deactivatedAt) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (session.createdAt.getTime() + ABSOLUTE_TTL_MS <= now.getTime()) return null;
  if (session.stage === "ACTIVE" && now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    return deps.db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: expiryFor("ACTIVE", audience, now) },
      include: { user: true },
    });
  }
  return session;
}

async function requireStage(deps: AuthDeps, token: string, stages: SessionStage[]): Promise<SessionWithUser> {
  const tokenHash = hashToken(token);
  const peek = await deps.db.session.findUnique({ where: { tokenHash }, select: { audience: true } });
  const session = peek ? await getSession(deps, token, peek.audience) : null;
  if (!session || !stages.includes(session.stage)) {
    throw new AuthError("no-session", "Your sign-in timed out. Start again.");
  }
  return session;
}

/**
 * Replaces a pending session with a fully signed-in one under a new
 * token, so a token seen before sign-in is worthless afterwards. Records
 * the sign-in and emails the person when the device is new to us.
 */
async function promote(
  tx: Prisma.TransactionClient,
  session: SessionWithUser,
  method: string,
  ctx: RequestContext,
  now: Date,
): Promise<string> {
  await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
  const orgId =
    session.user.kind === "CUSTOMER" ? (session.activeOrganisationId ?? (await primaryOrganisationId(tx, session.userId))) : null;
  const firstSignIn = session.user.lastLoginAt === null;
  await tx.user.update({
    where: { id: session.userId },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });
  const known = await tx.signInEvent.findFirst({
    where: {
      userId: session.userId,
      outcome: "SUCCEEDED",
      userAgent: ctx.userAgent?.slice(0, 400) ?? null,
      createdAt: { gt: new Date(now.getTime() - KNOWN_DEVICE_MS) },
    },
    select: { id: true },
  });
  await recordSignIn(tx, session.userId, "SUCCEEDED", method, ctx, now);
  if (!known && !firstSignIn) {
    await queueEmail(tx, {
      to: session.user.email,
      kind: "security.new_sign_in",
      payload: { at: now.toISOString(), ipAddress: ctx.ipAddress ?? null, userAgent: ctx.userAgent?.slice(0, 400) ?? null },
    });
  }
  return createSession(tx, session.user, "ACTIVE", orgId, ctx, now);
}

export async function signOut(deps: AuthDeps, token: string | undefined | null) {
  if (!token) return;
  const now = clock(deps);
  await deps.db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: now } });
}

/** Signs someone out everywhere except, optionally, this session. */
export async function signOutEverywhere(deps: AuthDeps, userId: string, keepSessionId?: string) {
  const now = clock(deps);
  await deps.db.session.updateMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
    data: { revokedAt: now },
  });
}

// ─── Authenticator setup ─────────────────────────────────────────────

/**
 * The secret to show as a QR code. Created on first call and kept until
 * setup is confirmed, so refreshing the page shows the same code.
 */
export async function beginAuthenticatorSetup(deps: AuthDeps, token: string): Promise<{ secret: string; uri: string; email: string }> {
  const session = await requireStage(deps, token, ["SETUP_PENDING"]);
  let secret: string;
  if (session.user.totpSecret && !session.user.totpEnabled) {
    secret = open(session.user.totpSecret, deps.encryptionKey);
  } else {
    secret = generateTotpSecret();
    await deps.db.user.update({
      where: { id: session.userId },
      data: { totpSecret: seal(secret, deps.encryptionKey), totpEnabled: false, totpLastStep: null },
    });
  }
  return { secret, uri: otpauthUri(secret, session.user.email, deps.issuer), email: session.user.email };
}

/**
 * Confirms the app is set up by checking one code. Returns the new
 * signed-in session and ten backup codes, shown to the person once.
 */
export async function confirmAuthenticatorSetup(
  deps: AuthDeps,
  token: string,
  code: string,
  ctx: RequestContext = {},
): Promise<{ token: string; recoveryCodes: string[] }> {
  const now = clock(deps);
  const session = await requireStage(deps, token, ["SETUP_PENDING"]);
  const user = session.user;
  assertNotLocked(user, now);
  if (!user.totpSecret || user.totpEnabled) throw new AuthError("no-session", "Start the setup again.");
  const step = verifyTotp(open(user.totpSecret, deps.encryptionKey), code, { at: now });
  if (step === null) return recordFailure(deps, user, "WRONG_CODE", ctx, now);

  const recoveryCodes = generateRecoveryCodes();
  const newSessionToken = await deps.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpLastStep: step, totpEnabledAt: now } });
    await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.recoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })) });
    if (session.activeOrganisationId) {
      await audit(tx, {
        organisationId: session.activeOrganisationId,
        actorKind: "CUSTOMER",
        actorUserId: user.id,
        actorLabel: user.name,
        action: "auth.two_step_on",
        summary: "Turned on two-step login",
        ipAddress: ctx.ipAddress,
      });
    }
    await queueEmail(tx, { to: user.email, kind: "security.two_step_on", payload: { at: now.toISOString() } });
    return promote(tx, session, "authenticator", ctx, now);
  });
  return { token: newSessionToken, recoveryCodes };
}

// ─── Sign-in, step 2: code ───────────────────────────────────────────

/** Accepts a six-digit code from the app, or one of the backup codes. */
export async function completeSignIn(
  deps: AuthDeps,
  token: string,
  code: string,
  ctx: RequestContext = {},
): Promise<{ token: string; usedRecoveryCode: boolean; recoveryCodesLeft: number }> {
  const now = clock(deps);
  const session = await requireStage(deps, token, ["CODE_PENDING"]);
  const user = session.user;
  assertNotLocked(user, now);
  if (!user.totpSecret || !user.totpEnabled) throw new AuthError("no-session", "Start again.");

  if (looksLikeRecoveryCode(code)) {
    const hash = hashRecoveryCode(code);
    const used = await deps.db.recoveryCode.updateMany({
      where: { userId: user.id, codeHash: hash, usedAt: null },
      data: { usedAt: now },
    });
    if (used.count !== 1) return recordFailure(deps, user, "WRONG_CODE", ctx, now);
    return deps.db.$transaction(async (tx) => {
      const left = await tx.recoveryCode.count({ where: { userId: user.id, usedAt: null } });
      await queueEmail(tx, { to: user.email, kind: "security.recovery_code_used", payload: { at: now.toISOString(), left } });
      return { token: await promote(tx, session, "backup code", ctx, now), usedRecoveryCode: true, recoveryCodesLeft: left };
    });
  }

  const step = verifyTotp(open(user.totpSecret, deps.encryptionKey), code, { at: now, lastUsedStep: user.totpLastStep });
  if (step === null) return recordFailure(deps, user, "WRONG_CODE", ctx, now);
  return deps.db.$transaction(async (tx) => {
    // Conditional update: two requests racing with the same code can't both win.
    const claimed = await tx.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (claimed.count !== 1) throw new AuthError("invalid-code", "That code has already been used. Wait for the next one.");
    const left = await tx.recoveryCode.count({ where: { userId: user.id, usedAt: null } });
    return { token: await promote(tx, session, "authenticator", ctx, now), usedRecoveryCode: false, recoveryCodesLeft: left };
  });
}

/** New backup codes replace the old ones. Needs a current code from the app. */
export async function regenerateRecoveryCodes(
  deps: AuthDeps,
  session: SessionWithUser,
  code: string,
  ctx: RequestContext = {},
): Promise<string[]> {
  const now = clock(deps);
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Sign in again.");
  const user = await deps.db.user.findUniqueOrThrow({ where: { id: session.userId } });
  assertNotLocked(user, now);
  if (!user.totpSecret || !user.totpEnabled) throw new AuthError("no-session", "Sign in again.");
  const step = verifyTotp(open(user.totpSecret, deps.encryptionKey), code, { at: now, lastUsedStep: user.totpLastStep });
  if (step === null) return recordFailure(deps, user, "WRONG_CODE", ctx, now);
  const codes = generateRecoveryCodes();
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.recoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })) });
    if (session.activeOrganisationId) {
      await audit(tx, {
        organisationId: session.activeOrganisationId,
        actorKind: "CUSTOMER",
        actorUserId: user.id,
        actorLabel: user.name,
        action: "auth.backup_codes_replaced",
        summary: "Made new backup codes; the old ones stopped working",
        ipAddress: ctx.ipAddress,
      });
    }
  });
  return codes;
}

// ─── Forgotten passwords ─────────────────────────────────────────────

/**
 * Emails a link to choose a new password, if the address has a customer
 * account. Says nothing either way, so the form can't be used to find out
 * who has an account. Asking again cancels any earlier link. The link's
 * token is made when the email is sent (see the email template), so no
 * usable link is ever stored.
 */
export async function requestPasswordReset(deps: AuthDeps, emailInput: string, ctx: RequestContext = {}): Promise<void> {
  const email = normaliseEmail(emailInput);
  if (!EMAIL_PATTERN.test(email)) return;
  const now = clock(deps);
  const user = await deps.db.user.findUnique({ where: { email }, select: { id: true, kind: true, email: true, deactivatedAt: true } });
  if (!user || user.kind !== "CUSTOMER" || user.deactivatedAt) return;
  await deps.db.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
    const reset = await tx.passwordReset.create({
      data: { userId: user.id, expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS), ipAddress: ctx.ipAddress ?? null, createdAt: now },
    });
    await queueEmail(tx, { to: user.email, kind: "auth.password_reset", payload: { resetId: reset.id } });
  });
}

/** Whether a reset link can still be used, without using it. */
export async function checkPasswordReset(deps: AuthDeps, token: string): Promise<"VALID" | "INVALID"> {
  if (!token || token.length > 100) return "INVALID";
  const reset = await deps.db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  const now = clock(deps);
  if (!reset || reset.usedAt || reset.expiresAt.getTime() <= now.getTime() || reset.user.deactivatedAt) return "INVALID";
  return "VALID";
}

/**
 * Sets a new password from an emailed link. The link works once. Signs
 * the person out everywhere and doesn't sign them in: they sign in again
 * with the new password and their authenticator code, as always.
 */
export async function resetPassword(deps: AuthDeps, token: string, password: string, ctx: RequestContext = {}): Promise<void> {
  if ((await checkPasswordReset(deps, token)) !== "VALID") throw new AuthError("invalid-input", "This link has expired or has already been used.");
  const reset = await deps.db.passwordReset.findUniqueOrThrow({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  const user = reset.user;
  // Checked before the link is used up, so a weak choice can be corrected.
  if (passwordStrength(password, [user.email, user.name]) !== "strong") {
    throw new AuthError("weak-password", "Choose a password of at least 12 characters that isn't easy to guess.");
  }
  const passwordHash = await hashPassword(password);
  const now = clock(deps);
  await deps.db.$transaction(async (tx) => {
    // Conditional update: two submits of the same link can't both win.
    const claimed = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now, tokenHash: null },
    });
    if (claimed.count !== 1) throw new AuthError("invalid-input", "This link has expired or has already been used.");
    await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now, tokenHash: null } });
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, failedAttempts: 0, lockedUntil: null } });
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    const memberships = await tx.membership.findMany({ where: { userId: user.id, active: true }, select: { organisationId: true } });
    for (const m of memberships) {
      await audit(tx, {
        organisationId: m.organisationId,
        actorKind: "CUSTOMER",
        actorUserId: user.id,
        actorLabel: user.name,
        action: "auth.password_reset",
        summary: "Chose a new password from an emailed link and was signed out everywhere",
        ipAddress: ctx.ipAddress,
      });
    }
    await queueEmail(tx, { to: user.email, kind: "security.password_changed", payload: { at: now.toISOString(), ipAddress: ctx.ipAddress ?? null, userAgent: ctx.userAgent?.slice(0, 400) ?? null } });
  });
}

// ─── Invitations ─────────────────────────────────────────────────────

export type InvitationLookup =
  | { state: "INVALID" }
  | {
      state: "VALID" | "EXPIRED" | "ACCEPTED" | "REVOKED";
      invitation: Prisma.InvitationGetPayload<{ include: { organisation: true; invitedBy: { include: { user: true } } } }>;
      /** True when the email already has an account. */
      hasAccount: boolean;
    };

export async function lookupInvitation(deps: AuthDeps, token: string): Promise<InvitationLookup> {
  if (!token || token.length > 100) return { state: "INVALID" };
  const invitation = await deps.db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organisation: true, invitedBy: { include: { user: true } } },
  });
  if (!invitation || invitation.organisation.deletedAt) return { state: "INVALID" };
  const hasAccount = Boolean(await deps.db.user.findUnique({ where: { email: invitation.email }, select: { id: true } }));
  const now = clock(deps);
  const state = invitation.revokedAt
    ? "REVOKED"
    : invitation.acceptedAt
      ? "ACCEPTED"
      : invitation.expiresAt.getTime() <= now.getTime()
        ? "EXPIRED"
        : "VALID";
  return { state, invitation, hasAccount };
}

async function claimInvitation(tx: Prisma.TransactionClient, token: string, now: Date) {
  const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation) throw new AuthError("invalid-input", "This invitation link isn't valid.");
  const claimed = await tx.invitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { acceptedAt: now, tokenHash: null },
  });
  if (claimed.count !== 1) throw new AuthError("invalid-input", "This invitation has already been used, withdrawn or has expired.");
  return invitation;
}

async function joinOrganisation(
  tx: Prisma.TransactionClient,
  invitation: { id: string; organisationId: string; role: Role },
  user: Pick<User, "id" | "name">,
  ctx: RequestContext,
) {
  await tx.membership.upsert({
    where: { organisationId_userId: { organisationId: invitation.organisationId, userId: user.id } },
    create: { organisationId: invitation.organisationId, userId: user.id, role: invitation.role },
    update: { role: invitation.role, active: true },
  });
  await audit(tx, {
    organisationId: invitation.organisationId,
    actorKind: "CUSTOMER",
    actorUserId: user.id,
    actorLabel: user.name,
    action: "member.joined",
    summary: `Joined the team`,
    targetType: "Invitation",
    targetId: invitation.id,
    data: { role: invitation.role },
    ipAddress: ctx.ipAddress,
  });
}

/**
 * Creates the invited person's account. Opening the emailed link proves
 * they own the address. Returns a session that can only set up the
 * authenticator, exactly like signing up.
 */
export async function acceptInvitationAsNewUser(
  deps: AuthDeps,
  token: string,
  input: { name: string; password: string },
  ctx: RequestContext = {},
): Promise<{ token: string }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new AuthError("invalid-input", "Enter your name.");
  const found = await lookupInvitation(deps, token);
  if (found.state === "INVALID") throw new AuthError("invalid-input", "This invitation link isn't valid.");
  if (passwordStrength(input.password, [found.invitation.email, name, found.invitation.organisation.name]) !== "strong") {
    throw new AuthError("weak-password", "Choose a password of at least 12 characters that isn't easy to guess.");
  }
  const passwordHash = await hashPassword(input.password);
  const now = clock(deps);
  return deps.db.$transaction(async (tx) => {
    const invitation = await claimInvitation(tx, token, now);
    if (await tx.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
      throw new AuthError("email-taken", "An account with this email already exists.");
    }
    const user = await tx.user.create({ data: { email: invitation.email, name, passwordHash, emailVerifiedAt: now, kind: "CUSTOMER" } });
    await joinOrganisation(tx, invitation, user, ctx);
    return { token: await createSession(tx, user, "SETUP_PENDING", invitation.organisationId, ctx, now) };
  });
}

/** Someone already signed in joins the organisation that invited them. */
export async function acceptInvitationAsExistingUser(
  deps: AuthDeps,
  token: string,
  session: SessionWithUser,
  ctx: RequestContext = {},
): Promise<void> {
  const now = clock(deps);
  await deps.db.$transaction(async (tx) => {
    const invitation = await claimInvitation(tx, token, now);
    if (invitation.email !== session.user.email) {
      throw new AuthError("invalid-input", `This invitation is for ${invitation.email}. Sign in with that email to accept it.`);
    }
    await joinOrganisation(tx, invitation, session.user, ctx);
    await tx.session.update({ where: { id: session.id }, data: { activeOrganisationId: invitation.organisationId } });
  });
}

// ─── More than one organisation ──────────────────────────────────────

export interface OrganisationChoice {
  id: string;
  name: string;
  role: Role;
}

/** Every organisation this person can open, oldest membership first. */
export async function organisationsFor(db: PrismaClient, userId: string): Promise<OrganisationChoice[]> {
  const memberships = await db.membership.findMany({
    where: { userId, active: true, organisation: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { role: true, organisation: { select: { id: true, name: true } } },
  });
  return memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name, role: m.role }));
}

/** Opens another organisation this person belongs to, in the same session. */
export async function switchOrganisation(deps: AuthDeps, session: SessionWithUser, organisationId: string) {
  if (session.stage !== "ACTIVE") throw new AuthError("no-session", "Your sign-in timed out. Start again.");
  const membership = await deps.db.membership.findUnique({
    where: { organisationId_userId: { organisationId, userId: session.userId } },
    select: { active: true },
  });
  if (!membership?.active) throw new AuthError("invalid-input", "You're not a member of that organisation.");
  await deps.db.session.update({ where: { id: session.id }, data: { activeOrganisationId: organisationId } });
}
