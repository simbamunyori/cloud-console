/** "Forgot password?": an emailed link that works once, for 30 minutes, and leads back to the normal two-step sign-in. */
import { describe, expect, it } from "vitest";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { deliverDue } from "../src/server/email/outbox";
import { PASSWORD_RESET_TTL_MS, checkPasswordReset, getSession, requestPasswordReset, resetPassword, startSignIn } from "../src/server/auth/service";
import { db, hasDb, makeOrganisation, testDeps } from "./helpers";

const NEW_PASSWORD = "lantern-okavango-harbour";

async function emailedToken(email: string, now: Date) {
  const adapter = new MemoryEmailAdapter();
  // Queued emails are due from the database's clock, which may be a moment ahead of the test's.
  await deliverDue(db, adapter, new Date(Math.max(now.getTime(), Date.now()) + 1000), 50, { toAddress: email });
  const message = adapter.sent.filter((m) => m.to === email && /reset-password/.test(m.text)).at(-1);
  const token = message?.text.match(/\/reset-password\/([\w%-]+)/)?.[1];
  return token ? decodeURIComponent(token) : null;
}

describe.skipIf(!hasDb)("password reset", () => {
  it("emails a single-use link, signs out everywhere and still asks for the authenticator code", async () => {
    let now = new Date();
    const deps = testDeps(() => now);
    const org = await makeOrganisation("Serowe Seeds");
    const before = await startSignIn(deps, { email: org.email, password: "correct-horse-battery" });

    await requestPasswordReset(deps, org.email.toUpperCase(), { ipAddress: "196.45.1.9" });
    const reset = await db.passwordReset.findFirstOrThrow({ where: { user: { email: org.email } } });
    // No usable link is stored, in the reset or in the queued email.
    expect(reset.tokenHash).toBeNull();
    const row = await db.outboundEmail.findFirstOrThrow({ where: { toAddress: org.email, kind: "auth.password_reset" } });
    expect(JSON.stringify(row.payload)).not.toMatch(/reset-password/);

    const token = await emailedToken(org.email, now);
    expect(token).toBeTruthy();
    expect(await checkPasswordReset(deps, token!)).toBe("VALID");

    await expect(resetPassword(deps, token!, "short")).rejects.toMatchObject({ code: "weak-password" });
    // A weak choice doesn't use the link up.
    expect(await checkPasswordReset(deps, token!)).toBe("VALID");

    await resetPassword(deps, token!, NEW_PASSWORD, { ipAddress: "196.45.1.9" });
    expect(await checkPasswordReset(deps, token!)).toBe("INVALID");
    await expect(resetPassword(deps, token!, NEW_PASSWORD)).rejects.toMatchObject({ code: "invalid-input" });

    // Every earlier session is gone, including a half-finished sign-in.
    expect(await getSession(deps, before.token)).toBeNull();
    await expect(startSignIn(deps, { email: org.email, password: "correct-horse-battery" })).rejects.toMatchObject({ code: "invalid-credentials" });
    // The new password only gets as far as the code step.
    expect((await startSignIn(deps, { email: org.email, password: NEW_PASSWORD })).stage).toBe("CODE_PENDING");

    const log = await db.auditEvent.findFirst({ where: { organisationId: org.organisationId, action: "auth.password_reset" } });
    expect(log?.summary).toMatch(/signed out everywhere/);
    expect(await db.outboundEmail.count({ where: { toAddress: org.email, kind: "security.password_changed" } })).toBe(1);

    // Links expire after 30 minutes, and asking again cancels the older link.
    await requestPasswordReset(deps, org.email);
    const first = await emailedToken(org.email, now);
    await requestPasswordReset(deps, org.email);
    const second = await emailedToken(org.email, now);
    expect(await checkPasswordReset(deps, first!)).toBe("INVALID");
    expect(await checkPasswordReset(deps, second!)).toBe("VALID");
    now = new Date(now.getTime() + PASSWORD_RESET_TTL_MS + 1000);
    expect(await checkPasswordReset(deps, second!)).toBe("INVALID");
  });

  it("says nothing about addresses without an account", async () => {
    const deps = testDeps();
    await expect(requestPasswordReset(deps, "nobody-here@example.co.bw")).resolves.toBeUndefined();
    await expect(requestPasswordReset(deps, "not an email")).resolves.toBeUndefined();
    expect(await db.outboundEmail.count({ where: { toAddress: "nobody-here@example.co.bw" } })).toBe(0);
    expect(await checkPasswordReset(deps, "made-up-token")).toBe("INVALID");
  });
});
