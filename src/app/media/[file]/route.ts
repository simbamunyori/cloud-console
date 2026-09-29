import { readFile } from "node:fs/promises";
import path from "node:path";
import { mediaDir } from "@/cms/media-dir";

const TYPES: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".avif": "image/avif" };

/**
 * Images uploaded in the website editor, for the public site. Only files
 * directly in the media directory, with an image extension, are served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = path.basename((await params).file);
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type || name.startsWith(".")) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(mediaDir(), name));
    return new Response(new Uint8Array(body), {
      headers: { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Response("Not found", { status: 404 });
    throw e;
  }
}
