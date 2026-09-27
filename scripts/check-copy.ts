/**
 * Fails when text breaks the copy rules in docs/CONSOLE_BRIEF.md and
 * brand/BRAND.md:
 * - no em dashes anywhere in the console's source (UI text, emails,
 *   the assistant's instructions);
 * - the company is "Fourth Generation Technologies", never the old name.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "prisma", "scripts", "docs", "README.md"];
const SKIP = new Set(["node_modules", ".next", "migrations"]);
const TEXT = /\.(tsx?|mjs|md|json|prisma|css|sql)$/;
const OLD_NAME = new RegExp(["4th", "Generations"].join(" "), "i");
const EM_DASH = String.fromCharCode(0x2014);

function* files(path: string): Generator<string> {
  const s = statSync(path);
  if (s.isFile()) {
    if (TEXT.test(path)) yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (SKIP.has(name)) continue;
    yield* files(join(path, name));
  }
}

const problems: string[] = [];
for (const root of ROOTS) {
  for (const file of files(root)) {
    // The brief is the customer's own document, quoted as delivered.
    const brief = file === join("docs", "CONSOLE_BRIEF.md");
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!brief && line.includes(EM_DASH)) problems.push(`${file}:${i + 1} has an em dash`);
        if (OLD_NAME.test(line)) problems.push(`${file}:${i + 1} uses the old company name`);
      });
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} copy problem(s). Use a comma, colon or full stop instead of an em dash.`);
  process.exit(1);
}
console.log("Copy check passed.");
