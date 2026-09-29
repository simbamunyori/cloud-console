/**
 * Runs once when the server starts (not during the build, not on the
 * edge): refuses to start in production while development placeholders
 * are still set, starts the website editor (which applies its pending
 * migrations in production), then starts background jobs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const [{ prisma }, { env }, { assertNoPlaceholders }, { secret }] = await Promise.all([import("@/server/db"), import("@/server/env"), import("@/server/placeholders"), import("@/server/secrets")]);
    try {
      await assertNoPlaceholders(prisma, { ...env(), WHMCS_API_IDENTIFIER_SET: Boolean(secret("WHMCS_API_IDENTIFIER")), WHMCS_API_SECRET_SET: Boolean(secret("WHMCS_API_SECRET")) });
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("@payload-config")]);
    await getPayload({ config });
    const { startJobs } = await import("@/server/jobs/boss");
    await startJobs();
  }
}
