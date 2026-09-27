/** Starts background jobs when the server starts (not during the build, not on the edge). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startJobs } = await import("@/server/jobs/boss");
    await startJobs();
  }
}
