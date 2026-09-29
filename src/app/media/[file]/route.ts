import path from "node:path";
import { mediaStorage } from "@/cms/storage";

const TYPES: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".avif": "image/avif" };

/**
 * Images uploaded in the website editor, for the public site. Only files
 * directly in the media store, with an image extension, are served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = path.basename((await params).file);
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type || name.startsWith(".")) return new Response("Not found", { status: 404 });
  const body = await mediaStorage().read(name);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(body), { headers: { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}
