import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { colors } from "./tokens";

/**
 * Drift guard between the canonical TS tokens (this package) and the
 * web app's `globals.css`. The web side declares `:root` CSS vars in
 * raw CSS because Tailwind 4 is CSS-first and can't import a TS
 * object. This test parses the CSS, extracts every `--<token>: <hex>;`
 * line, and asserts it matches the value in tokens.ts byte-for-byte
 * (case-insensitive on the hex, since CSS commonly uses lowercase).
 *
 * When this test fails it ALWAYS means one of:
 *   1. Someone added a token to tokens.ts and forgot globals.css.
 *   2. Someone changed a hex in one place and not the other.
 *   3. A token was renamed in one place.
 *
 * Fix: bring the two in sync. The TS file is canonical, but in
 * practice you'll edit whichever you opened first — just match the
 * other before pushing.
 */

const GLOBALS_CSS_PATH = resolve(
  __dirname,
  "../../../apps/web/src/app/globals.css"
);

/**
 * Match lines like `--accent-book: #00FF85;` in the `:root` block.
 * Captures the token name and the hex.
 */
const CSS_VAR_RE = /^\s*--([a-z-]+):\s*(#[0-9a-fA-F]+)\s*;/;

function parseCssTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Only scan inside `:root { ... }`. The file also contains `@theme
  // inline` which references the same vars by indirection — we don't
  // need to parse that block, it's a Tailwind-side mapping.
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!rootMatch) {
    throw new Error("Could not find `:root` block in globals.css");
  }
  for (const line of rootMatch[1].split("\n")) {
    const m = line.match(CSS_VAR_RE);
    if (!m) continue;
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

describe("design tokens drift guard", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
  const cssTokens = parseCssTokens(css);

  it("every TS token exists in globals.css with the same hex", () => {
    const mismatches: string[] = [];
    for (const [name, hex] of Object.entries(colors)) {
      const cssValue = cssTokens[name];
      if (!cssValue) {
        mismatches.push(`Missing in globals.css: --${name} (tokens.ts: ${hex})`);
        continue;
      }
      if (cssValue !== hex.toLowerCase()) {
        mismatches.push(
          `Mismatch on --${name}: globals.css=${cssValue}, tokens.ts=${hex}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every globals.css token has a matching TS token (no orphans)", () => {
    const tsKeys = new Set(Object.keys(colors));
    const orphans = Object.keys(cssTokens).filter((k) => !tsKeys.has(k));
    expect(orphans).toEqual([]);
  });
});
