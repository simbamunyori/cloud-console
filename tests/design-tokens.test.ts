import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every colour, size and duration comes from src/config/theme/tokens.json
 * (Change Request 01, section 5). This fails on one-off values in code:
 * hex or rgb colours, Tailwind arbitrary values like `w-[440px]`, and
 * numeric durations like `duration-300`. Add a token instead, and use its
 * name (max-w-form, duration-fast) or its variable (`var(--layout-aside)`).
 *
 * Arbitrary values may only arrange tokens: fr ratios, auto, minmax and
 * var(--token), as in `grid-cols-[1fr_var(--layout-aside)]`. Variants
 * such as `aria-[current=page]:` and `has-[:checked]:` are selectors,
 * not values, and are allowed.
 */
const ROOTS = ["src"];
const SKIP = [/src\/config\/theme\//, /\.test\.tsx?$/];
const VARIANTS = new Set(["aria", "data", "group", "peer", "has", "not", "in", "supports", "nth", "nth-last"]);
const ARRANGEMENT = /^(?:\d+(?:\.\d+)?fr|auto|minmax|[_(),])*$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css|mjs)$/.test(name) && !SKIP.some((s) => s.test(path)) ? [path] : [];
  });
}

export function problemsIn(line: string): string[] {
  const found: string[] = [];
  if (/(^|[\s"'`:(,])(?<!href=["'`])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?![-\w])/.test(line)) found.push("a hex colour");
  if (/\b(?:rgba?|hsla?|oklch|oklab)\(/.test(line)) found.push("a colour function");
  for (const m of line.matchAll(/(?<![\w-])([a-z][a-z0-9-]*)-\[([^\]\s"'`]+)\]/g)) {
    const prefix = m[1].split(":").pop()!;
    if (VARIANTS.has(prefix)) continue;
    if (!ARRANGEMENT.test(m[2].replace(/var\(--[a-z0-9-]+\)/g, ""))) found.push(`an arbitrary value ${m[0]}`);
  }
  if (/(?<![\w-])(?:duration|delay)-\d+\b/.test(line)) found.push("a numeric duration");
  return found;
}

describe("design tokens", () => {
  it("recognises one-off values", () => {
    expect(problemsIn('className="max-w-[440px] text-[14px]"')).toHaveLength(2);
    expect(problemsIn('style={{ color: "#0B1F3A" }}')).toEqual(["a hex colour"]);
    expect(problemsIn("transition duration-300")).toEqual(["a numeric duration"]);
    expect(problemsIn('className="grid-cols-[1fr_var(--layout-aside)] sm:grid-cols-[1.2fr_1fr_auto] aria-[current=page]:text-link has-[:checked]:bg-brand-soft"')).toEqual([]);
    expect(problemsIn('href="#main" href="#add"')).toEqual([]);
  });

  it("are the only source of colours, sizes and durations", () => {
    const problems: string[] = [];
    for (const file of ROOTS.flatMap((r) => files(r))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          for (const what of problemsIn(line)) problems.push(`${relative(".", file)}:${i + 1} has ${what}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(problems).toEqual([]);
  });
});
