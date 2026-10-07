// Copies the brand pack's logos and web icons into public/brand so pages
// can serve them. brand/ stays the only source; public/brand is ignored
// by git and rebuilt before every dev start and build.
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("public/brand", { recursive: true, force: true });
mkdirSync("public/brand", { recursive: true });
cpSync("brand/logo", "public/brand/logo", { recursive: true });
cpSync("brand/icons/web", "public/brand/icons", { recursive: true });
// Thebe, our software, in its own brand (docs/design).
cpSync("brand/thebe", "public/brand/thebe", { recursive: true });
// Poppins, for the share images drawn on the server (src/app/api/share).
mkdirSync("public/brand/fonts", { recursive: true });
// The logo as PNG, for PDFs and emails (email apps don't all show SVG).
mkdirSync("public/brand/png", { recursive: true });
for (const f of ["fgt-logo-1280.png", "fgt-logo-reverse-1280.png"]) cpSync(`brand/png/${f}`, `public/brand/png/${f}`);
for (const f of ["Poppins-Bold.ttf", "Poppins-Light.ttf", "OFL.txt"]) cpSync(`brand/fonts/${f}`, `public/brand/fonts/${f}`);
