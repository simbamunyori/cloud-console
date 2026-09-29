import path from "node:path";

/** Where uploaded images are kept: a directory on the server, included in the nightly backup. */
export const mediaDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || path.join(process.cwd(), "media"));

/** The public address of an uploaded file. The editor's own API sits behind the admin allowlist, so files are served from /media. */
export const mediaUrl = (filename: string) => `/media/${encodeURIComponent(filename)}`;
