import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MediaStorage } from ".";

/** Where uploaded images are kept on disk: MEDIA_DIR, or ./media. The nightly backup copies it. */
export const mediaDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || path.join(process.cwd(), "media"));

/** Images on the server's own disk, served by the site at /media. */
export function diskStorage(): MediaStorage {
  return {
    name: "disk",
    upload: { staticDir: mediaDir() },
    plugins: [],
    url: (filename) => `/media/${encodeURIComponent(filename)}`,
    read: async (filename) => {
      try {
        return new Uint8Array(await readFile(path.join(mediaDir(), path.basename(filename))));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
  };
}
