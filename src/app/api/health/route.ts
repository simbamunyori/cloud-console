import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * For the deploy script and uptime checks: 200 with the running release
 * when the app is up and the database answers, 503 otherwise. Says nothing
 * else about the server.
 */
export async function GET() {
  const release = process.env.RELEASE ?? "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, release }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, release }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
