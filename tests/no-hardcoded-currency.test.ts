import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every amount on screen or in an email goes through formatMoney, written
 * the customer's market's way. This fails if UI code writes a currency by
 * hand: a symbol before a number ("P 10", "R 5"), US$, or a currency code
 * in text. Currency codes belong in data (markets, catalogue), not in UI.
 */
const ROOTS = ["src/app", "src/components", "src/server/email"];
const RULES: [RegExp, string][] = [
  [/\b(BWP|ZAR)\b/, "a currency code"],
  [/US\$/, "a US dollar sign"],
  [/(^|[\s"'`>({])[PR]\s?\d/, "a currency symbol before a number"],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("money in UI code", () => {
  it("is never written by hand", () => {
    const problems: string[] = [];
    for (const file of ROOTS.flatMap((r) => files(r))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          for (const [pattern, what] of RULES) if (pattern.test(line)) problems.push(`${relative(".", file)}:${i + 1} has ${what}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(problems).toEqual([]);
  });
});
