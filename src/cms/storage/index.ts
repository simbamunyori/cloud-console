import type { Plugin } from "payload";
import { diskStorage } from "./disk";

/**
 * Where the website editor keeps uploaded images. Everything else (the
 * media collection, the /media route) goes through this, so moving to
 * object storage later means adding an adapter here (for example with
 * @payloadcms/storage-s3 as its plugin) and setting MEDIA_STORAGE, with no
 * change to pages or the editor.
 */
export interface MediaStorage {
  name: string;
  /** Upload settings for the media collection. */
  upload: { staticDir?: string; disableLocalStorage?: boolean };
  /** Payload plugins the storage needs; an object store brings its own. */
  plugins: Plugin[];
  /** The public address of a stored file. */
  url(filename: string): string;
  /** A stored file's bytes, for /media, or null when there is none. */
  read(filename: string): Promise<Uint8Array | null>;
}

export function mediaStorage(): MediaStorage {
  const kind = process.env.MEDIA_STORAGE || "disk";
  if (kind === "disk") return diskStorage();
  throw new Error(`MEDIA_STORAGE=${kind} isn't supported yet. Use disk.`);
}
