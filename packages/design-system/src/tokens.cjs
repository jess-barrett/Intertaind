/**
 * Canonical design tokens for Intertaind — CommonJS runtime data.
 *
 * Why .cjs and not .ts: this file is `require()`d directly by
 * Tailwind config loaders running in raw Node (no Metro / Vite / SWC
 * in between). CommonJS is the only format guaranteed to load there.
 * TypeScript consumers import via `./tokens.ts`, which thinly
 * re-exports these values with proper `as const` typing.
 *
 * This is the single source of truth for every cross-app design
 * token. See ./tokens.ts for the TS wrapper and ./tokens.test.ts for
 * the drift guard against `apps/web/src/app/globals.css`.
 *
 * Token-update workflow:
 *   1. Change the value here.
 *   2. Change the matching `--color-*` line in apps/web/src/app/globals.css.
 *   3. `pnpm --filter @intertaind/design-system test` to confirm sync.
 *
 * Naming: token keys are kebab-case Tailwind utility suffixes. A token
 * named "accent-book" becomes `bg-accent-book`, `text-accent-book`,
 * `border-accent-book`, etc. in both apps' className output.
 */

const colors = Object.freeze({
  // Brand — neon magenta (classic 80s)
  brand: "#FF006E",
  "brand-light": "#FF4D97",
  "brand-dark": "#D1005A",

  // Surface — true near-black, neutral. The default → border ramp
  // is "background up to outline" so utilities layer cleanly.
  "surface-default": "#0A0A0A",
  "surface-raised": "#141414",
  "surface-overlay": "#1F1F1F",
  "surface-border": "#2E2E2E",

  // Media-type accents — full neon saturation. Used by the
  // `MEDIA_TYPE_CONFIG` table in `@intertaind/types` so any
  // utility class derived from these MUST be scanned by both apps'
  // Tailwind content globs (mobile already includes packages/types
  // via tailwind.config.js content glob).
  "accent-book": "#00FF85",
  "accent-movie": "#FF3D71",
  "accent-tv": "#B388FF",
  "accent-game": "#FFD600",

  // Text — CRT cream white ramp
  "text-primary": "#F0F0F0",
  "text-secondary": "#A0A0A0",
  "text-muted": "#606060",

  // Page background / foreground — wired separately from
  // surface-default so future themes can split them (e.g., a beige
  // foreground over a near-black surface).
  background: "#0A0A0A",
  foreground: "#F0F0F0",
});

module.exports = { colors };
