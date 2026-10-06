/**
 * Fails when text breaks the copy rules in docs/CONSOLE_BRIEF.md and
 * brand/BRAND.md:
 * - no em dashes anywhere in the console's source (UI text, emails,
 *   the assistant's instructions);
 * - the company is "Fourth Generation Technologies", never the old name;
 * - the product is "Local data copy", never its old name;
 * - customer-facing text (pages, components, emails) says "your currency"
 *   rather than naming one, and has no exclamation marks.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "prisma", "scripts", "docs", "README.md"];
const SKIP = new Set(["node_modules", ".next", "migrations"]);
const TEXT = /\.(tsx?|mjs|md|json|prisma|css|sql)$/;
const OLD_NAME = new RegExp(["4th", "Generations"].join(" "), "i");
const OLD_PRODUCT = new RegExp(["Botswana", "Copy"].join(" "), "i");
const EM_DASH = String.fromCharCode(0x2014);
/** Customer-facing text lives here. */
const UI = /^src[\\/](app|components|server[\\/]email)[\\/].*\.tsx?$/;
const PULA = /\bpula\b/i;
/** An exclamation mark ending a sentence in a string or in JSX text. */
const EXCLAIM = /[A-Za-z]!(?=["'`<]|\s+[A-Z"'`<])/;

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
    // The brief, change requests and the final build plan are the customer's
    // own documents, kept as delivered. They may quote the old name to ban it.
    const brief = file === join("docs", "CONSOLE_BRIEF.md");
    const request = /^docs[\\/](CHANGE_REQUEST_\d+|FINAL_BUILD|STRATEGY_ROLLOUT)\.md$/.test(file);
    const ui = UI.test(file) && !/\.test\.tsx?$/.test(file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!brief && line.includes(EM_DASH)) problems.push(`${file}:${i + 1} has an em dash`);
        if (!request && OLD_NAME.test(line)) problems.push(`${file}:${i + 1} uses the old company name`);
        if (!brief && !request && OLD_PRODUCT.test(line)) problems.push(`${file}:${i + 1} uses the product's old name; it is "Local data copy"`);
        if (ui && PULA.test(line)) problems.push(`${file}:${i + 1} names a currency in copy; say "your currency"`);
        if (ui && EXCLAIM.test(line)) problems.push(`${file}:${i + 1} has an exclamation mark`);
      });
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} copy problem(s). See the copy rules in docs/CHANGE_REQUEST_01.md, section 2.`);
  process.exit(1);
}
console.log("Copy check passed.");
