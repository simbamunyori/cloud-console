import { prisma } from "@/server/db";
import { logoPng } from "@/server/company/company";

/** The company logo as PNG, from Admin > Company, for emails (not every email app shows SVG). */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "light" && kind !== "dark") return new Response("Not found", { status: 404 });
  const png = await logoPng(prisma, kind);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
