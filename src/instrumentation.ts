/**
 * Runs once when the server starts (not during the build, not on the
 * edge): refuses to start in production while development placeholders
 * are still set, then starts background jobs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const [{ prisma }, { env }, { assertNoPlaceholders }] = await Promise.all([import("@/server/db"), import("@/server/env"), import("@/server/placeholders")]);
    try {
      await assertNoPlaceholders(prisma, env());
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    const { startJobs } = await import("@/server/jobs/boss");
    await startJobs();
  }
}
