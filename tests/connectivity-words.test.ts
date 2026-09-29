import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Change Request 02: until the Connectivity family is published, nothing
 * the public or customers read may offer internet, fibre or wireless
 * services. This scans the public site, the website editor's seed
 * content, the catalogue and demo seeds, the console and its emails. The
 * family's own name, "Connectivity", is the only word allowed.
 */

const BANNED = /\b(internet|fibre|fiber|wireless)\b/i;

const ROOTS = [
  // The public site and the console: pages, components, emails, the assistant's instructions.
  "src/app",
  "src/components",
  "src/config",
  "src/server",
  // The website editor's seed content and blocks.
  "src/cms",
  // The demo seed and the catalogue migrations that add families and products.
  "prisma/seed.ts",
  "prisma/migrations",
];
const TEXT = /\.(tsx?|sql|json|md)$/;

function* files(path: string): Generator<string> {
  const s = statSync(path);
  if (s.isFile()) {
    if (TEXT.test(path) && !/\.test\.tsx?$/.test(path)) yield path;
    return;
  }
  for (const name of readdirSync(path)) yield* files(join(path, name));
}

describe("connectivity words", () => {
  it("appear nowhere in the site, the seeds or the console", () => {
    const found: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(root)) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            const m = line.match(BANNED);
            if (m) found.push(`${file}:${i + 1} says "${m[0]}"`);
          });
      }
    }
    expect(found).toEqual([]);
  });

  it("would catch one", () => {
    for (const s of ["Fast Internet for your office", "fibre to the door", "Fiber links", "a wireless link"]) expect(BANNED.test(s)).toBe(true);
    for (const s of ["Connectivity", "internetwork", "fibreglass"]) expect(BANNED.test(s)).toBe(false);
  });
});
